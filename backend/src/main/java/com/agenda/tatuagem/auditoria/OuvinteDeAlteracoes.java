package com.agenda.tatuagem.auditoria;

import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import org.hibernate.Hibernate;
import org.hibernate.event.spi.PostDeleteEvent;
import org.hibernate.event.spi.PostDeleteEventListener;
import org.hibernate.event.spi.PostInsertEvent;
import org.hibernate.event.spi.PostInsertEventListener;
import org.hibernate.event.spi.PostUpdateEvent;
import org.hibernate.event.spi.PostUpdateEventListener;
import org.hibernate.persister.entity.EntityPersister;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import com.agenda.tatuagem.autenticacao.Usuario;
import com.agenda.tatuagem.autenticacao.UsuarioAtual;

/**
 * Registra toda inclusão, alteração e exclusão feita pelo Hibernate, de qualquer
 * tabela, sem cada tela precisar lembrar de gravar o histórico. A gravação usa a
 * mesma transação: se a alteração for desfeita, o registro dela também é.
 */
@Component
class OuvinteDeAlteracoes implements PostInsertEventListener, PostUpdateEventListener, PostDeleteEventListener {

	static final String INCLUSAO = "INCLUSAO";
	static final String ALTERACAO = "ALTERACAO";
	static final String EXCLUSAO = "EXCLUSAO";

	/** Tabelas que não são dados do estúdio. */
	private static final Set<String> IGNORADAS = Set.of("Sessao", "Auditoria");

	/** Campos que nunca aparecem no histórico, só a indicação de que mudaram. */
	private static final Set<String> SIGILOSOS = Set.of("senhaHash", "pinHash");

	/** Campos que não ajudam a entender a alteração. */
	private static final Set<String> OMITIDOS = Set.of("criadoEm", "criadoPor", "conteudo");

	private static final Map<String, String> ROTULOS = Map.ofEntries(Map.entry("nome", "Nome"),
			Map.entry("telefone", "Telefone"), Map.entry("instagram", "Instagram"),
			Map.entry("observacoes", "Observações"), Map.entry("observacao", "Observação"),
			Map.entry("cliente", "Cliente"), Map.entry("tatuagem", "Tatuagem"), Map.entry("descricao", "Descrição"),
			Map.entry("localCorpo", "Local do corpo"), Map.entry("valorTotal", "Valor total"),
			Map.entry("responsavel", "Responsável"), Map.entry("data", "Data"), Map.entry("hora", "Horário"),
			Map.entry("duracaoMinutos", "Duração (min)"), Map.entry("valor", "Valor"), Map.entry("status", "Status"),
			Map.entry("forma", "Forma de pagamento"), Map.entry("sinal", "Sinal"), Map.entry("pago", "Pago"),
			Map.entry("tipo", "Tipo"), Map.entry("nomeUsuario", "Usuário"), Map.entry("email", "E-mail"),
			Map.entry("senhaHash", "Senha"), Map.entry("pinHash", "Código"), Map.entry("perfil", "Perfil"),
			Map.entry("ativo", "Ativo"), Map.entry("funcao", "Função"), Map.entry("valorAluguel", "Aluguel"),
			Map.entry("diaPagamentoAluguel", "Dia do aluguel"));

	private static final DateTimeFormatter DATA = DateTimeFormatter.ofPattern("dd/MM/yyyy");
	private static final DateTimeFormatter DATA_HORA = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");
	private static final DateTimeFormatter HORA = DateTimeFormatter.ofPattern("HH:mm");
	private static final int TAMANHO_MAXIMO = 4000;

	private final JdbcTemplate jdbc;

	OuvinteDeAlteracoes(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public void onPostInsert(PostInsertEvent evento) {
		EntityPersister persister = evento.getPersister();
		if (ignorar(persister)) {
			return;
		}
		String[] campos = persister.getPropertyNames();
		Object[] estado = evento.getState();
		List<String> linhas = new ArrayList<>();
		for (int i = 0; i < campos.length; i++) {
			if (estado[i] != null && !OMITIDOS.contains(campos[i])) {
				linhas.add(rotulo(campos[i]) + ": " + valor(campos[i], estado[i]));
			}
		}
		gravar(INCLUSAO, persister, evento.getId(), evento.getEntity(), linhas);
	}

	@Override
	public void onPostUpdate(PostUpdateEvent evento) {
		EntityPersister persister = evento.getPersister();
		if (ignorar(persister)) {
			return;
		}
		String[] campos = persister.getPropertyNames();
		Object[] novo = evento.getState();
		Object[] antigo = evento.getOldState();
		List<String> linhas = new ArrayList<>();
		for (int i = 0; i < campos.length; i++) {
			Object antes = antigo == null ? null : antigo[i];
			if (OMITIDOS.contains(campos[i]) || mesmoValor(antes, novo[i])) {
				continue;
			}
			if (SIGILOSOS.contains(campos[i])) {
				linhas.add(rotulo(campos[i]) + ": alterado");
			} else if (antigo == null) {
				linhas.add(rotulo(campos[i]) + ": " + valor(campos[i], novo[i]));
			} else {
				linhas.add(rotulo(campos[i]) + ": " + valor(campos[i], antes) + " → " + valor(campos[i], novo[i]));
			}
		}
		if (!linhas.isEmpty()) {
			gravar(ALTERACAO, persister, evento.getId(), evento.getEntity(), linhas);
		}
	}

	/** Guarda como o registro estava, para ser possível saber o que foi apagado. */
	@Override
	public void onPostDelete(PostDeleteEvent evento) {
		EntityPersister persister = evento.getPersister();
		if (ignorar(persister)) {
			return;
		}
		String[] campos = persister.getPropertyNames();
		Object[] estado = evento.getDeletedState();
		List<String> linhas = new ArrayList<>();
		for (int i = 0; estado != null && i < campos.length; i++) {
			if (estado[i] != null && !OMITIDOS.contains(campos[i])) {
				linhas.add(rotulo(campos[i]) + ": " + valor(campos[i], estado[i]));
			}
		}
		gravar(EXCLUSAO, persister, evento.getId(), evento.getEntity(), linhas);
	}

	// Usado pelo Hibernate 6; no 7 não existe mais, e aqui fica só como um método comum.
	public boolean requiresPostCommitHandling(EntityPersister persister) {
		return false;
	}

	private void gravar(String acao, EntityPersister persister, Object id, Object entidade, List<String> linhas) {
		Long usuarioId = UsuarioAtual.get();
		// Quem cria a própria conta ainda não estava identificado: a inclusão fica no nome dela.
		if (!UsuarioAtual.identificado() && entidade instanceof Usuario novo && INCLUSAO.equals(acao)) {
			usuarioId = novo.getId();
		}
		String usuarioNome = jdbc.queryForList("SELECT NOME FROM USUARIO WHERE ID = ?", String.class, usuarioId)
				.stream()
				.findFirst()
				.orElse(null);
		String detalhes = String.join("\n", linhas);
		if (detalhes.length() > TAMANHO_MAXIMO) {
			detalhes = detalhes.substring(0, TAMANHO_MAXIMO - 1) + "…";
		}
		jdbc.update("INSERT INTO AUDITORIA (DATA_HORA, USUARIO_ID, USUARIO_NOME, ORIGEM, ACAO, ENTIDADE, REGISTRO_ID,"
				+ " DETALHES) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", LocalDateTime.now(), usuarioId, usuarioNome,
				UsuarioAtual.estudio() ? "ESTUDIO" : "REMOTO", acao, nomeCurto(persister), idNumerico(id),
				detalhes.isEmpty() ? null : detalhes);
	}

	private static boolean ignorar(EntityPersister persister) {
		return IGNORADAS.contains(nomeCurto(persister));
	}

	private static String nomeCurto(EntityPersister persister) {
		String nome = persister.getEntityName();
		return nome.substring(nome.lastIndexOf('.') + 1);
	}

	private static Long idNumerico(Object id) {
		return id instanceof Number numero ? numero.longValue() : null;
	}

	private static boolean mesmoValor(Object antes, Object depois) {
		if (antes instanceof BigDecimal a && depois instanceof BigDecimal d) {
			return a.compareTo(d) == 0;
		}
		if (antes instanceof byte[] || depois instanceof byte[]) {
			return true;
		}
		Object idAntes = idDeEntidade(antes);
		Object idDepois = idDeEntidade(depois);
		if (idAntes != null || idDepois != null) {
			return Objects.equals(idAntes, idDepois);
		}
		return Objects.equals(antes, depois);
	}

	private static String rotulo(String campo) {
		return ROTULOS.getOrDefault(campo, campo);
	}

	private static String valor(String campo, Object valor) {
		if (valor == null) {
			return "(vazio)";
		}
		if (SIGILOSOS.contains(campo)) {
			return "definido";
		}
		if (valor instanceof Boolean b) {
			return b ? "sim" : "não";
		}
		if (valor instanceof BigDecimal numero) {
			return "R$ " + numero.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString().replace('.', ',');
		}
		if (valor instanceof LocalDate data) {
			return data.format(DATA);
		}
		if (valor instanceof LocalDateTime dataHora) {
			return dataHora.format(DATA_HORA);
		}
		if (valor instanceof LocalTime hora) {
			return hora.format(HORA);
		}
		if (valor instanceof byte[]) {
			return "(arquivo)";
		}
		Object id = idDeEntidade(valor);
		if (id != null) {
			return descricaoDeEntidade(valor, id);
		}
		return valor.toString();
	}

	/** Entidades ligadas aparecem pelo nome, quando têm um, e pelo número. */
	private static String descricaoDeEntidade(Object entidade, Object id) {
		// Não carrega nada do banco no meio da gravação: se o nome não está em memória, fica só o número.
		if (!Hibernate.isInitialized(entidade)) {
			return "nº " + id;
		}
		try {
			Method getNome = entidade.getClass().getMethod("getNome");
			Object nome = getNome.invoke(entidade);
			if (nome != null) {
				return nome + " (nº " + id + ")";
			}
		} catch (ReflectiveOperationException | RuntimeException e) {
			// Sem nome (ou não carregado): mostra só o número.
		}
		return "nº " + id;
	}

	private static Object idDeEntidade(Object valor) {
		if (valor == null || valor instanceof String || valor instanceof Number || valor instanceof Boolean
				|| valor instanceof Enum<?> || valor.getClass().getName().startsWith("java.")) {
			return null;
		}
		try {
			return valor.getClass().getMethod("getId").invoke(valor);
		} catch (ReflectiveOperationException | RuntimeException e) {
			return null;
		}
	}
}
