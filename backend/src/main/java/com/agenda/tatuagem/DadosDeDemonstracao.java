package com.agenda.tatuagem;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

import javax.imageio.ImageIO;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import com.agenda.tatuagem.agenda.Cliente;
import com.agenda.tatuagem.agenda.ContatoCliente;
import com.agenda.tatuagem.agenda.Imagem;
import com.agenda.tatuagem.agenda.Pagamento;
import com.agenda.tatuagem.agenda.SessaoTatuagem;
import com.agenda.tatuagem.agenda.StatusSessao;
import com.agenda.tatuagem.agenda.Tatuagem;
import com.agenda.tatuagem.autenticacao.Perfil;
import com.agenda.tatuagem.autenticacao.Senhas;
import com.agenda.tatuagem.autenticacao.Usuario;
import com.agenda.tatuagem.autenticacao.UsuarioAtual;

import jakarta.persistence.EntityManager;

/**
 * Dados de exemplo para testar todas as telas. Só roda com o perfil "demo":
 *
 * <pre>
 * .\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=demo"
 * </pre>
 *
 * Não apaga nada: acrescenta colaboradores, clientes, tatuagens, sessões,
 * pagamentos, imagens e contatos, com datas em volta do dia de hoje. Roda uma
 * vez só; se os colaboradores de exemplo já existirem, não faz nada.
 */
@Component
@Profile("demo")
@Order(Ordered.LOWEST_PRECEDENCE)
class DadosDeDemonstracao implements ApplicationRunner {

	private static final Logger LOG = LoggerFactory.getLogger(DadosDeDemonstracao.class);
	private static final String SENHA = "senha1234";
	private static final String MARCA = "demo.rafa";

	private final EntityManager em;
	private final TransactionTemplate transacao;
	private final LocalDate hoje = LocalDate.now();

	DadosDeDemonstracao(EntityManager em, TransactionTemplate transacao) {
		this.em = em;
		this.transacao = transacao;
	}

	@Override
	public void run(ApplicationArguments args) {
		Long existentes = transacao.execute(s -> em
				.createQuery("select count(u) from Usuario u where u.nomeUsuario = :marca", Long.class)
				.setParameter("marca", MARCA)
				.getSingleResult());
		if (existentes != null && existentes > 0) {
			LOG.info("Dados de demonstração já carregados; nada a fazer.");
			return;
		}
		try {
			transacao.executeWithoutResult(s -> carregar());
			LOG.info("Dados de demonstração carregados. Senha de todos os colaboradores de exemplo: {}", SENHA);
		} finally {
			UsuarioAtual.limpar();
		}
	}

	private void carregar() {
		// ---------- Colaboradores ----------
		Usuario admin = administrador();
		agir(admin);
		Usuario rafa = colaborador("Rafa Lima", MARCA, "rafa@exemplo.com", "Tatuador", "16991110001", "800", 5,
				Perfil.PADRAO, "4821");
		Usuario bia = colaborador("Bia Santos", "demo.bia", null, "Tatuadora", "16991110002", "900", 10,
				Perfil.PADRAO, "5932");
		Usuario duda = colaborador("Duda Rocha", "demo.duda", null, "Piercer", "16991110003", "500", 15,
				Perfil.PADRAO, "6043");
		colaborador("Carol Mendes", "demo.carol", "carol@exemplo.com", "Recepção", null, null, null, Perfil.ADMIN,
				"7154");
		// Excluído: some das listas, mas continua no histórico.
		Usuario antigo = colaborador("Téo Martins", "demo.teo", null, "Tatuador", null, "700", 20, Perfil.PADRAO,
				"8265");
		em.flush();
		antigo.setAtivo(false);
		antigo.setPinHash(null);
		antigo.setNomeUsuario("demo.teo#" + antigo.getId());
		em.flush();

		// ---------- Clientes ----------
		Cliente ana = cliente("Ana Souza", "16992220001", "ana.tattoo", "Prefere traço fino. Alérgica a látex.");
		Cliente bruno = cliente("Bruno Carvalho", "16992220002", "brunoc", null);
		Cliente camila = cliente("Camila Ferreira", "16992220003", null, "Vem sempre com a irmã.");
		Cliente diego = cliente("Diego Almeida", null, "diego.alm", "Sem telefone: falar pelo Instagram.");
		Cliente elisa = cliente("Elisa Ramos", "16992220005", "elisaramos", null);
		Cliente fabio = cliente("Fábio Nogueira", "16992220006", null, null);
		Cliente gabi = cliente("Gabriela Lopes", "16992220007", "gabilopes", "Quer fechar as costas aos poucos.");
		Cliente heitor = cliente("Heitor Pires", "16992220008", null, null);
		Cliente isa = cliente("Isabela Moura", "16992220009", "isamoura", null);
		Cliente joao = cliente("João Batista", "16992220010", null, "Cliente antigo do estúdio.");
		Cliente karen = cliente("Karen Duarte", "16992220011", "karend", null);
		cliente("Lucas Prado", "16992220012", "lucasprado", "Só pediu orçamento, ainda não marcou.");
		em.flush();

		// ---------- Agenda de hoje e dos próximos dias ----------
		// Fechamento de braço em 3 sessões: uma feita, a de hoje e uma cancelada que foi remarcada.
		Tatuagem braco = tatuagem(ana, admin, "Fechamento de braço com rosas e ornamentos", "Braço", "2400");
		sessao(braco, admin, hoje.minusDays(20), "10:00", 300, "800", StatusSessao.REALIZADA, "Contorno completo.");
		sessao(braco, admin, hoje.minusDays(6), "14:00", 240, "800", StatusSessao.CANCELADA, "Cliente gripada.");
		sessao(braco, admin, hoje, "10:00", 300, "800", StatusSessao.AGENDADA, "Sombreamento.");
		sessao(braco, admin, hoje.plusDays(21), "10:00", 240, "800", StatusSessao.AGENDADA, null);
		pagamento(braco, hoje.minusDays(30), "300", "Pix", "Sinal", true, true);
		pagamento(braco, hoje.minusDays(20), "800", "Cartão de crédito", "1ª sessão", false, true);
		imagem(braco, "Referência rosas", new Color(170, 20, 30), "ROSAS");
		imagem(braco, "Desenho final", new Color(20, 20, 20), "BRAÇO");

		// Sessão longa (dia inteiro) com sinal ainda não pago: aparece "Sinal pendente".
		Tatuagem costas = tatuagem(gabi, rafa, "Costas fechadas: dragão oriental (parte 1)", "Costas", "4500");
		sessao(costas, rafa, hoje.plusDays(1), "09:00", 600, "1500", StatusSessao.AGENDADA, "Trazer almoço.");
		sessao(costas, rafa, hoje.plusDays(29), "09:00", 600, "1500", StatusSessao.AGENDADA, null);
		pagamento(costas, hoje.minusDays(3), "500", null, "Combinado para pagar até a véspera", true, false);
		imagem(costas, "Dragão", new Color(30, 90, 60), "DRAGÃO");

		// Outra tatuadora no mesmo dia: os valores dela ficam ocultos para os outros.
		Tatuagem fineline = tatuagem(camila, bia, "Fine line de ramo de oliveira", "Antebraço", "450");
		sessao(fineline, bia, hoje, "15:30", 120, "450", StatusSessao.AGENDADA, null);
		pagamento(fineline, hoje.minusDays(7), "150", "Pix", "Sinal", true, true);

		// Piercing com a Duda: sessão de outra pessoa dentro da tatuagem do Rafa.
		Tatuagem lettering = tatuagem(bruno, rafa, "Lettering \"Família\" com data", "Costela", "600");
		sessao(lettering, duda, hoje.plusDays(2), "11:00", 90, "600", StatusSessao.AGENDADA,
				"Duda cobre o horário do Rafa.");

		// Cliente sem telefone (sem botão de WhatsApp).
		Tatuagem semFone = tatuagem(diego, admin, "Blackwork geométrico", "Panturrilha", "900");
		sessao(semFone, admin, hoje.plusDays(4), "13:00", 240, "900", StatusSessao.AGENDADA, null);

		// Durante o mês, para o calendário e o "previsto no mês".
		Tatuagem mandala = tatuagem(elisa, admin, "Mandala no ombro", "Ombro", "700");
		sessao(mandala, admin, hoje.minusDays(9), "16:00", 180, "700", StatusSessao.REALIZADA, null);
		pagamento(mandala, hoje.minusDays(9), "700", "Dinheiro", null, false, true);
		imagem(mandala, "Mandala pronta", new Color(90, 40, 120), "MANDALA");

		Tatuagem gato = tatuagem(isa, bia, "Gatinho minimalista", "Pulso", "250");
		sessao(gato, bia, hoje.minusDays(2), "18:00", 60, "250", StatusSessao.REALIZADA, null);
		pagamento(gato, hoje.minusDays(2), "250", "Cartão de débito", null, false, true);

		Tatuagem retoque = tatuagem(fabio, rafa, "Retoque de tribal antiga", "Ombro", "200");
		sessao(retoque, rafa, hoje.plusDays(7), "17:00", 60, "200", StatusSessao.AGENDADA, null);

		// ---------- Clientes para chamar de volta ----------
		// Sumida há 8 meses, nunca procurada: aparece em "Para contatar".
		Tatuagem antiga1 = tatuagem(karen, admin, "Borboleta aquarela", "Nuca", "500");
		sessao(antiga1, admin, hoje.minusMonths(8), "14:00", 150, "500", StatusSessao.REALIZADA, null);
		pagamento(antiga1, hoje.minusMonths(8), "500", "Pix", null, false, true);

		// Sumido há mais de um ano, contatado há 7 meses: volta ao destaque.
		Tatuagem antiga2 = tatuagem(joao, rafa, "Âncora old school", "Antebraço", "350");
		sessao(antiga2, rafa, hoje.minusMonths(14), "10:00", 120, "350", StatusSessao.REALIZADA, null);
		pagamento(antiga2, hoje.minusMonths(14), "350", "Dinheiro", null, false, true);
		contato(joao, rafa, hoje.minusMonths(7), "Mandei mensagem, disse que ia pensar.");

		// Sumido há 10 meses, mas contatado há 2: não aparece.
		Tatuagem antiga3 = tatuagem(heitor, bia, "Nome da filha", "Pulso", "200");
		sessao(antiga3, bia, hoje.minusMonths(10), "11:00", 60, "200", StatusSessao.REALIZADA, null);
		pagamento(antiga3, hoje.minusMonths(10), "200", "Pix", null, false, true);
		contato(heitor, bia, hoje.minusMonths(2), "Vai voltar depois das férias.");

		// Última tatuagem há 9 meses, mas já tem horário marcado (o retoque acima): não aparece.
		Tatuagem volta = tatuagem(fabio, rafa, "Tribal no ombro", "Ombro", "300");
		sessao(volta, rafa, hoje.minusMonths(9), "15:00", 90, "300", StatusSessao.REALIZADA, null);
		pagamento(volta, hoje.minusMonths(9), "300", "Dinheiro", null, false, true);
		em.flush();

		// Algumas alterações feitas por outra pessoa, para o histórico ter mais de um autor.
		agir(rafa);
		bruno.setObservacoes("Prefere horários de manhã.");
		em.flush();
		agir(admin);
	}

	// ---------- Apoio ----------

	/** Quem aparece no histórico como autor das próximas alterações. */
	private void agir(Usuario u) {
		em.flush();
		UsuarioAtual.set(u.getId(), u.isAdmin(), true);
	}

	/** O administrador que já existe; se ainda não houver contas, cria um. */
	private Usuario administrador() {
		List<Usuario> admins = em
				.createQuery("select u from Usuario u where u.perfil = :admin and u.ativo = true order by u.id",
						Usuario.class)
				.setParameter("admin", Perfil.ADMIN)
				.getResultList();
		if (!admins.isEmpty()) {
			return admins.get(0);
		}
		return colaborador("Administrador", "admin", null, "Tatuador", null, null, null, Perfil.ADMIN, "9376");
	}

	private Usuario colaborador(String nome, String nomeUsuario, String email, String funcao, String telefone,
			String aluguel, Integer dia, Perfil perfil, String pin) {
		Usuario u = new Usuario();
		u.setNome(nome);
		u.setNomeUsuario(nomeUsuario);
		u.setEmail(email);
		u.setFuncao(funcao);
		u.setTelefone(telefone);
		u.setValorAluguel(aluguel != null ? new BigDecimal(aluguel) : null);
		u.setDiaPagamentoAluguel(dia);
		u.setPerfil(perfil);
		u.setSenhaHash(Senhas.gerarHash(SENHA));
		u.setPinHash(pinLivre(pin) ? Senhas.gerarHashPin(pin) : null);
		em.persist(u);
		return u;
	}

	/** Não repete o código de alguém que já existe (por exemplo, o do administrador). */
	private boolean pinLivre(String pin) {
		return em.createQuery("select u.pinHash from Usuario u where u.pinHash is not null", String.class)
				.getResultStream()
				.noneMatch(hash -> Senhas.confere(pin, hash));
	}

	private Cliente cliente(String nome, String telefone, String instagram, String observacoes) {
		Cliente c = new Cliente();
		c.setNome(nome);
		c.setTelefone(telefone);
		c.setInstagram(instagram);
		c.setObservacoes(observacoes);
		c.setCriadoEm(LocalDateTime.now());
		c.setCriadoPor(UsuarioAtual.get());
		em.persist(c);
		return c;
	}

	private Tatuagem tatuagem(Cliente cliente, Usuario responsavel, String descricao, String local, String valor) {
		Tatuagem t = new Tatuagem();
		t.setCliente(cliente);
		t.setResponsavel(responsavel);
		t.setDescricao(descricao);
		t.setLocalCorpo(local);
		t.setValorTotal(new BigDecimal(valor));
		t.setCriadoEm(LocalDateTime.now());
		t.setCriadoPor(UsuarioAtual.get());
		em.persist(t);
		return t;
	}

	private void sessao(Tatuagem t, Usuario responsavel, LocalDate data, String hora, int minutos, String valor,
			StatusSessao status, String observacao) {
		SessaoTatuagem s = new SessaoTatuagem();
		s.setTatuagem(t);
		s.setResponsavel(responsavel);
		s.setData(data);
		s.setHora(LocalTime.parse(hora));
		s.setDuracaoMinutos(minutos);
		s.setValor(new BigDecimal(valor));
		s.setStatus(status);
		s.setObservacao(observacao);
		em.persist(s);
	}

	private void pagamento(Tatuagem t, LocalDate data, String valor, String forma, String observacao, boolean sinal,
			boolean pago) {
		Pagamento p = new Pagamento();
		p.setTatuagem(t);
		p.setData(data);
		p.setValor(new BigDecimal(valor));
		p.setForma(forma);
		p.setObservacao(observacao);
		p.setSinal(sinal);
		p.setPago(pago);
		em.persist(p);
	}

	private void contato(Cliente c, Usuario quem, LocalDate dia, String observacao) {
		ContatoCliente k = new ContatoCliente();
		k.setCliente(c);
		k.setUsuario(quem);
		k.setData(dia.atTime(15, 30));
		k.setObservacao(observacao);
		em.persist(k);
	}

	private void imagem(Tatuagem t, String nome, Color cor, String texto) {
		Imagem i = new Imagem();
		i.setTatuagem(t);
		i.setNome(nome + ".png");
		i.setTipo("image/png");
		i.setConteudo(desenhar(cor, texto));
		i.setCriadoEm(LocalDateTime.now());
		em.persist(i);
	}

	/** Uma figura simples no lugar de uma foto de referência. */
	private static byte[] desenhar(Color cor, String texto) {
		int lado = 480;
		BufferedImage img = new BufferedImage(lado, lado, BufferedImage.TYPE_INT_RGB);
		Graphics2D g = img.createGraphics();
		g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
		g.setColor(new Color(245, 242, 236));
		g.fillRect(0, 0, lado, lado);
		g.setColor(cor);
		g.setStroke(new BasicStroke(10));
		List<int[]> circulos = new ArrayList<>(List.of(new int[] { 90, 140 }, new int[] { 160, 90 },
				new int[] { 230, 160 }));
		for (int[] c : circulos) {
			g.drawOval(c[0], c[1], 160, 160);
		}
		g.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 46));
		int largura = g.getFontMetrics().stringWidth(texto);
		g.drawString(texto, (lado - largura) / 2, 430);
		g.dispose();
		try (ByteArrayOutputStream saida = new ByteArrayOutputStream()) {
			ImageIO.write(img, "png", saida);
			return saida.toByteArray();
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}
}
