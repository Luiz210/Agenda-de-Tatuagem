package com.agenda.tatuagem.agenda;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.agenda.tatuagem.agenda.AgendaDTOs.ClienteDados;
import com.agenda.tatuagem.agenda.AgendaDTOs.ClienteResumo;
import com.agenda.tatuagem.agenda.AgendaDTOs.ContatoDados;
import com.agenda.tatuagem.agenda.AgendaDTOs.ContatoDetalhe;
import com.agenda.tatuagem.agenda.AgendaDTOs.Ficha;
import com.agenda.tatuagem.agenda.AgendaDTOs.ImagemDetalhe;
import com.agenda.tatuagem.agenda.AgendaDTOs.PagamentoDados;
import com.agenda.tatuagem.agenda.AgendaDTOs.PagamentoDetalhe;
import com.agenda.tatuagem.agenda.AgendaDTOs.SessaoAgenda;
import com.agenda.tatuagem.agenda.AgendaDTOs.SessaoDados;
import com.agenda.tatuagem.agenda.AgendaDTOs.SessaoDetalhe;
import com.agenda.tatuagem.agenda.AgendaDTOs.SinalResumo;
import com.agenda.tatuagem.agenda.AgendaDTOs.TatuagemDados;
import com.agenda.tatuagem.agenda.AgendaDTOs.TatuagemDetalhe;
import com.agenda.tatuagem.autenticacao.Usuario;
import com.agenda.tatuagem.autenticacao.UsuarioAtual;

import jakarta.persistence.EntityManager;

/**
 * Clientes, tatuagens, sessões e pagamentos. A agenda e os clientes são do
 * estúdio: todos veem e alteram. Os valores de cada tatuagem são só do tatuador
 * responsável por ela.
 */
@Service
@Transactional
public class AgendaService {

	/** Depois de quanto tempo sem tatuar (e sem ser procurado) o cliente volta a ser destacado. */
	static final int MESES_PARA_RECONTATO = 6;

	private static final String NAO_CANCELADA = " s.status <> com.agenda.tatuagem.agenda.StatusSessao.CANCELADA ";

	private final EntityManager em;

	AgendaService(EntityManager em) {
		this.em = em;
	}

	// ---------- Clientes ----------

	@Transactional(readOnly = true)
	public List<ClienteResumo> clientes() {
		List<Cliente> clientes = em.createQuery("select c from Cliente c order by lower(c.nome)", Cliente.class)
				.getResultList();
		Map<Long, Long> tatuagens = mapa(em.createQuery(
				"select t.cliente.id, count(t) from Tatuagem t group by t.cliente.id", Object[].class));
		Map<Long, BigDecimal> pagos = mapa(em.createQuery("select p.tatuagem.cliente.id, sum(p.valor) from Pagamento p"
				+ " where p.pago = true and p.tatuagem.responsavel.id = :eu group by p.tatuagem.cliente.id",
				Object[].class).setParameter("eu", UsuarioAtual.get()));
		Map<Long, LocalDate> ultimas = mapa(em.createQuery("select s.tatuagem.cliente.id, max(s.data)"
				+ " from SessaoTatuagem s where" + NAO_CANCELADA + "group by s.tatuagem.cliente.id", Object[].class));
		Map<Long, LocalDateTime> contatos = mapa(em.createQuery(
				"select k.cliente.id, max(k.data) from ContatoCliente k group by k.cliente.id", Object[].class));
		return clientes.stream()
				.map(c -> resumo(c, tatuagens.getOrDefault(c.getId(), 0L), pagos.get(c.getId()),
						ultimas.get(c.getId()), contatos.get(c.getId())))
				.toList();
	}

	public ClienteResumo criarCliente(ClienteDados dados) {
		Cliente cliente = new Cliente();
		preencher(cliente, dados);
		cliente.setCriadoEm(LocalDateTime.now());
		cliente.setCriadoPor(UsuarioAtual.get());
		em.persist(cliente);
		return resumo(cliente, 0, null, null, null);
	}

	public void alterarCliente(Long id, ClienteDados dados) {
		preencher(cliente(id), dados);
	}

	public void removerCliente(Long id) {
		Cliente cliente = cliente(id);
		Long tatuagens = em.createQuery("select count(t) from Tatuagem t where t.cliente = :c", Long.class)
				.setParameter("c", cliente)
				.getSingleResult();
		if (tatuagens > 0) {
			throw new RegraException(HttpStatus.CONFLICT,
					"Este cliente tem tatuagens na ficha. Remova as tatuagens antes de remover o cliente.");
		}
		contatosDe(cliente).forEach(em::remove);
		em.remove(cliente);
	}

	@Transactional(readOnly = true)
	public Ficha ficha(Long clienteId) {
		Cliente cliente = cliente(clienteId);
		List<Long> ids = em
				.createQuery("select t.id from Tatuagem t where t.cliente = :c order by t.criadoEm desc", Long.class)
				.setParameter("c", cliente)
				.getResultList();
		List<TatuagemDetalhe> tatuagens = ids.stream().map(this::tatuagem).toList();
		BigDecimal pago = tatuagens.stream()
				.filter(TatuagemDetalhe::valoresVisiveis)
				.map(TatuagemDetalhe::totalPago)
				.reduce(BigDecimal.ZERO, BigDecimal::add);
		LocalDate ultima = tatuagens.stream()
				.flatMap(t -> t.sessoes().stream())
				.filter(s -> s.status() != StatusSessao.CANCELADA)
				.map(SessaoDetalhe::data)
				.max(LocalDate::compareTo)
				.orElse(null);
		List<ContatoDetalhe> contatos = contatosDe(cliente).stream().map(AgendaService::detalheContato).toList();
		LocalDateTime ultimoContato = contatos.isEmpty() ? null : contatos.get(0).data();
		return new Ficha(resumo(cliente, tatuagens.size(), pago, ultima, ultimoContato), tatuagens, contatos);
	}

	// ---------- Contatos (reengajamento) ----------

	/** Marca o cliente como contatado: o destaque some e só volta depois de 6 meses. */
	public ContatoDetalhe registrarContato(Long clienteId, ContatoDados dados) {
		UsuarioAtual.exigirIdentificado();
		ContatoCliente contato = new ContatoCliente();
		contato.setCliente(cliente(clienteId));
		contato.setData(LocalDateTime.now());
		contato.setUsuario(euMesmo());
		contato.setObservacao(limitar(dados != null ? dados.observacao() : null, 500, "A observação"));
		em.persist(contato);
		return detalheContato(contato);
	}

	/** Desfaz um contato marcado por engano. */
	public void removerContato(Long id) {
		UsuarioAtual.exigirIdentificado();
		em.remove(buscar(ContatoCliente.class, id, "Contato"));
	}

	private List<ContatoCliente> contatosDe(Cliente cliente) {
		return em.createQuery("select k from ContatoCliente k left join fetch k.usuario where k.cliente = :c"
				+ " order by k.data desc, k.id desc", ContatoCliente.class)
				.setParameter("c", cliente)
				.getResultList();
	}

	// ---------- Tatuagens ----------

	@Transactional(readOnly = true)
	public TatuagemDetalhe tatuagem(Long id) {
		Tatuagem t = buscar(Tatuagem.class, id, "Tatuagem");
		boolean visiveis = valoresVisiveis(t);
		List<SessaoDetalhe> sessoes = em.createQuery(
				"select s from SessaoTatuagem s where s.tatuagem = :t order by s.data, s.hora", SessaoTatuagem.class)
				.setParameter("t", t)
				.getResultStream()
				.map(s -> detalhe(s, visiveis))
				.toList();
		List<PagamentoDetalhe> pagamentos = !visiveis ? List.of()
				: em.createQuery("select p from Pagamento p where p.tatuagem = :t order by p.data, p.id",
						Pagamento.class)
						.setParameter("t", t)
						.getResultStream()
						.map(AgendaService::detalhe)
						.toList();
		List<ImagemDetalhe> imagens = em.createQuery("select new com.agenda.tatuagem.agenda.AgendaDTOs$ImagemDetalhe("
				+ "i.id, i.nome, i.tipo) from Imagem i where i.tatuagem = :t order by i.id", ImagemDetalhe.class)
				.setParameter("t", t)
				.getResultList();
		BigDecimal pago = !visiveis ? null
				: pagamentos.stream()
						.filter(PagamentoDetalhe::pago)
						.map(PagamentoDetalhe::valor)
						.reduce(BigDecimal.ZERO, BigDecimal::add);
		Cliente c = t.getCliente();
		Usuario r = t.getResponsavel();
		return new TatuagemDetalhe(t.getId(), c.getId(), c.getNome(), c.getTelefone(), r != null ? r.getId() : null,
				r != null ? r.getNome() : null, visiveis, t.getDescricao(), t.getLocalCorpo(),
				visiveis ? t.getValorTotal() : null, pago, sessoes, pagamentos, imagens);
	}

	/** Cria a tatuagem e, se vieram junto, a primeira sessão e o sinal. */
	public TatuagemDetalhe criarTatuagem(TatuagemDados dados) {
		UsuarioAtual.exigirIdentificado();
		Tatuagem t = new Tatuagem();
		preencherBasico(t, dados);
		t.setResponsavel(dados.responsavelId() != null ? colaborador(dados.responsavelId()) : euMesmo());
		t.setValorTotal(naoNegativo(dados.valorTotal(), "O valor total"));
		t.setCriadoEm(LocalDateTime.now());
		t.setCriadoPor(UsuarioAtual.get());
		em.persist(t);
		if (dados.primeiraSessao() != null) {
			SessaoTatuagem s = new SessaoTatuagem();
			s.setTatuagem(t);
			preencher(s, dados.primeiraSessao(), true);
			em.persist(s);
		}
		if (dados.sinal() != null && dados.sinal().signum() > 0) {
			Pagamento p = new Pagamento();
			p.setTatuagem(t);
			p.setData(LocalDate.now());
			p.setValor(dados.sinal());
			p.setSinal(true);
			p.setPago(!Boolean.FALSE.equals(dados.sinalPago()));
			em.persist(p);
		}
		em.flush();
		return tatuagem(t.getId());
	}

	/**
	 * Todos podem corrigir descrição e local. O valor só muda por quem é
	 * responsável (para os outros ele nem aparece), e o responsável só é trocado
	 * por ele mesmo ou por um administrador.
	 */
	public void alterarTatuagem(Long id, TatuagemDados dados) {
		UsuarioAtual.exigirIdentificado();
		Tatuagem t = buscar(Tatuagem.class, id, "Tatuagem");
		preencherBasico(t, dados);
		if (valoresVisiveis(t)) {
			t.setValorTotal(naoNegativo(dados.valorTotal(), "O valor total"));
		}
		Long atual = t.getResponsavel() != null ? t.getResponsavel().getId() : null;
		if (dados.responsavelId() != null && !dados.responsavelId().equals(atual)) {
			if (!UsuarioAtual.admin() && atual != null && !atual.equals(UsuarioAtual.get())) {
				throw new RegraException(HttpStatus.FORBIDDEN,
						"Só o responsável pela tatuagem ou um administrador pode passá-la para outra pessoa.");
			}
			Usuario novo = colaborador(dados.responsavelId());
			// As sessões que estavam com o responsável antigo acompanham a troca.
			em.createQuery("select s from SessaoTatuagem s where s.tatuagem = :t", SessaoTatuagem.class)
					.setParameter("t", t)
					.getResultStream()
					.filter(s -> s.getResponsavel() == null || s.getResponsavel().getId().equals(atual))
					.forEach(s -> s.setResponsavel(novo));
			t.setResponsavel(novo);
		}
	}

	/**
	 * Remove a tatuagem com as sessões, os pagamentos e as imagens dela. Um a um,
	 * para cada exclusão entrar no histórico.
	 */
	public void removerTatuagem(Long id) {
		UsuarioAtual.exigirIdentificado();
		Tatuagem t = buscar(Tatuagem.class, id, "Tatuagem");
		for (Class<?> tipo : List.of(Imagem.class, Pagamento.class, SessaoTatuagem.class)) {
			em.createQuery("select x from " + tipo.getSimpleName() + " x where x.tatuagem = :t", tipo)
					.setParameter("t", t)
					.getResultList()
					.forEach(em::remove);
		}
		em.remove(t);
	}

	// ---------- Sessões ----------

	@Transactional(readOnly = true)
	public List<SessaoAgenda> sessoes(LocalDate inicio, LocalDate fim, Long responsavelId) {
		if (inicio == null || fim == null || fim.isBefore(inicio)) {
			throw RegraException.invalido("Informe o início e o fim do período.");
		}
		String filtro = responsavelId != null ? " and s.responsavel.id = :responsavel" : "";
		var consulta = em.createQuery("select s from SessaoTatuagem s join fetch s.tatuagem t join fetch t.cliente"
				+ " left join fetch s.responsavel where s.data between :inicio and :fim" + filtro
				+ " order by s.data, s.hora", SessaoTatuagem.class)
				.setParameter("inicio", inicio)
				.setParameter("fim", fim);
		if (responsavelId != null) {
			consulta.setParameter("responsavel", responsavelId);
		}
		return agenda(consulta.getResultList());
	}

	/** As próximas sessões ainda agendadas, a partir de um dia. */
	@Transactional(readOnly = true)
	public List<SessaoAgenda> proximas(LocalDate aPartirDe, int limite, Long responsavelId) {
		String filtro = responsavelId != null ? " and s.responsavel.id = :responsavel" : "";
		var consulta = em.createQuery("select s from SessaoTatuagem s join fetch s.tatuagem t join fetch t.cliente"
				+ " left join fetch s.responsavel where s.data >= :dia"
				+ " and s.status = com.agenda.tatuagem.agenda.StatusSessao.AGENDADA" + filtro
				+ " order by s.data, s.hora", SessaoTatuagem.class)
				.setParameter("dia", aPartirDe)
				.setMaxResults(Math.max(1, Math.min(limite, 50)));
		if (responsavelId != null) {
			consulta.setParameter("responsavel", responsavelId);
		}
		return agenda(consulta.getResultList());
	}

	public SessaoDetalhe criarSessao(SessaoDados dados) {
		UsuarioAtual.exigirIdentificado();
		if (dados.tatuagemId() == null) {
			throw RegraException.invalido("Escolha a tatuagem desta sessão.");
		}
		SessaoTatuagem s = new SessaoTatuagem();
		s.setTatuagem(buscar(Tatuagem.class, dados.tatuagemId(), "Tatuagem"));
		preencher(s, dados, valoresVisiveis(s.getTatuagem()));
		em.persist(s);
		return detalhe(s, valoresVisiveis(s.getTatuagem()));
	}

	public SessaoDetalhe alterarSessao(Long id, SessaoDados dados) {
		UsuarioAtual.exigirIdentificado();
		SessaoTatuagem s = buscar(SessaoTatuagem.class, id, "Sessão");
		boolean visiveis = valoresVisiveis(s.getTatuagem());
		preencher(s, dados, visiveis);
		return detalhe(s, visiveis);
	}

	public void removerSessao(Long id) {
		UsuarioAtual.exigirIdentificado();
		em.remove(buscar(SessaoTatuagem.class, id, "Sessão"));
	}

	// ---------- Pagamentos ----------

	public PagamentoDetalhe criarPagamento(PagamentoDados dados) {
		if (dados.tatuagemId() == null) {
			throw RegraException.invalido("Escolha a tatuagem deste pagamento.");
		}
		Tatuagem t = buscar(Tatuagem.class, dados.tatuagemId(), "Tatuagem");
		exigirResponsavel(t);
		Pagamento p = new Pagamento();
		p.setTatuagem(t);
		preencher(p, dados);
		em.persist(p);
		return detalhe(p);
	}

	public PagamentoDetalhe alterarPagamento(Long id, PagamentoDados dados) {
		Pagamento p = buscar(Pagamento.class, id, "Pagamento");
		exigirResponsavel(p.getTatuagem());
		preencher(p, dados);
		return detalhe(p);
	}

	public void removerPagamento(Long id) {
		Pagamento p = buscar(Pagamento.class, id, "Pagamento");
		exigirResponsavel(p.getTatuagem());
		em.remove(p);
	}

	// ---------- Imagens ----------

	public ImagemDetalhe adicionarImagem(Long tatuagemId, String nome, String tipo, byte[] conteudo) {
		UsuarioAtual.exigirIdentificado();
		if (tipo == null || !tipo.startsWith("image/")) {
			throw RegraException.invalido("Envie uma imagem (JPG, PNG ou WEBP).");
		}
		if (conteudo == null || conteudo.length == 0) {
			throw RegraException.invalido("A imagem está vazia.");
		}
		Imagem i = new Imagem();
		i.setTatuagem(buscar(Tatuagem.class, tatuagemId, "Tatuagem"));
		i.setNome(nome == null || nome.isBlank() ? "imagem" : nome.substring(0, Math.min(nome.length(), 150)));
		i.setTipo(tipo.length() > 50 ? "image/jpeg" : tipo);
		i.setConteudo(conteudo);
		i.setCriadoEm(LocalDateTime.now());
		em.persist(i);
		return new ImagemDetalhe(i.getId(), i.getNome(), i.getTipo());
	}

	@Transactional(readOnly = true)
	public Imagem imagem(Long id) {
		Imagem i = buscar(Imagem.class, id, "Imagem");
		i.getConteudo();
		return i;
	}

	public void removerImagem(Long id) {
		UsuarioAtual.exigirIdentificado();
		em.remove(buscar(Imagem.class, id, "Imagem"));
	}

	// ---------- Apoio ----------

	/**
	 * Os valores são de quem faz a tatuagem. As antigas, sem responsável, ficam
	 * visíveis para quem estiver identificado.
	 */
	private static boolean valoresVisiveis(Tatuagem t) {
		if (!UsuarioAtual.identificado()) {
			return false;
		}
		return t.getResponsavel() == null || t.getResponsavel().getId().equals(UsuarioAtual.get());
	}

	private static void exigirResponsavel(Tatuagem t) {
		UsuarioAtual.exigirIdentificado();
		if (!valoresVisiveis(t)) {
			throw new RegraException(HttpStatus.FORBIDDEN,
					"Os pagamentos desta tatuagem são do tatuador responsável por ela.");
		}
	}

	private List<SessaoAgenda> agenda(List<SessaoTatuagem> sessoes) {
		if (sessoes.isEmpty()) {
			return List.of();
		}
		Collection<Long> tatuagens = sessoes.stream().map(s -> s.getTatuagem().getId()).distinct().toList();

		// Número da sessão dentro da tatuagem (1 de 3), sem contar as canceladas.
		Map<Long, List<Long>> ordem = new HashMap<>();
		em.createQuery("select s.tatuagem.id, s.id from SessaoTatuagem s where s.tatuagem.id in :ids and"
				+ NAO_CANCELADA + "order by s.data, s.hora, s.id", Object[].class)
				.setParameter("ids", tatuagens)
				.getResultStream()
				.forEach(l -> ordem.computeIfAbsent((Long) l[0], k -> new ArrayList<>()).add((Long) l[1]));
		Map<Long, Long> capas = new HashMap<>();
		em.createQuery("select i.tatuagem.id, min(i.id) from Imagem i where i.tatuagem.id in :ids group by i.tatuagem.id",
				Object[].class)
				.setParameter("ids", tatuagens)
				.getResultStream()
				.forEach(l -> capas.put((Long) l[0], (Long) l[1]));
		// Sinal de cada tatuagem: soma e se ainda falta pagar alguma parte.
		Map<Long, BigDecimal> sinais = new HashMap<>();
		Map<Long, Boolean> sinaisPagos = new HashMap<>();
		em.createQuery("select p.tatuagem.id, p.valor, p.pago from Pagamento p where p.sinal = true"
				+ " and p.tatuagem.id in :ids", Object[].class)
				.setParameter("ids", tatuagens)
				.getResultStream()
				.forEach(l -> {
					Long t = (Long) l[0];
					sinais.merge(t, (BigDecimal) l[1], BigDecimal::add);
					sinaisPagos.merge(t, (Boolean) l[2], Boolean::logicalAnd);
				});

		return sessoes.stream().map(s -> {
			Tatuagem t = s.getTatuagem();
			Cliente c = t.getCliente();
			Usuario r = s.getResponsavel() != null ? s.getResponsavel() : t.getResponsavel();
			boolean visiveis = valoresVisiveis(t);
			List<Long> daTatuagem = ordem.getOrDefault(t.getId(), List.of());
			SinalResumo sinal = sinais.containsKey(t.getId())
					? new SinalResumo(visiveis ? sinais.get(t.getId()) : null, sinaisPagos.get(t.getId()))
					: null;
			return new SessaoAgenda(s.getId(), s.getData(), s.getHora(), s.getDuracaoMinutos(),
					visiveis ? s.getValor() : null, s.getStatus(), s.getObservacao(), t.getId(), t.getDescricao(),
					t.getLocalCorpo(), visiveis ? t.getValorTotal() : null, c.getId(), c.getNome(), c.getTelefone(),
					daTatuagem.indexOf(s.getId()) + 1, daTatuagem.size(), capas.get(t.getId()),
					r != null ? r.getId() : null, r != null ? r.getNome() : null, visiveis, sinal);
		}).toList();
	}

	private static SessaoDetalhe detalhe(SessaoTatuagem s, boolean visiveis) {
		Usuario r = s.getResponsavel();
		return new SessaoDetalhe(s.getId(), r != null ? r.getId() : null, r != null ? r.getNome() : null,
				s.getData(), s.getHora(), s.getDuracaoMinutos(), visiveis ? s.getValor() : null, s.getStatus(),
				s.getObservacao());
	}

	private static PagamentoDetalhe detalhe(Pagamento p) {
		return new PagamentoDetalhe(p.getId(), p.getData(), p.getValor(), p.getForma(), p.getObservacao(),
				p.isSinal(), p.isPago());
	}

	private static ClienteResumo resumo(Cliente c, long tatuagens, BigDecimal pago, LocalDate ultima,
			LocalDateTime ultimoContato) {
		return new ClienteResumo(c.getId(), c.getNome(), c.getTelefone(), c.getInstagram(), c.getObservacoes(),
				tatuagens, pago != null ? pago : BigDecimal.ZERO, ultima, ultimoContato,
				paraContatar(ultima, ultimoContato, LocalDate.now()));
	}

	/**
	 * A última tatuagem (a data mais recente de sessão não cancelada, então quem
	 * tem horário marcado nunca entra) foi há 6 meses ou mais, e o último
	 * contato, se houve, também. Quem nunca tatuou não entra.
	 */
	static boolean paraContatar(LocalDate ultimaSessao, LocalDateTime ultimoContato, LocalDate hoje) {
		LocalDate limite = hoje.minusMonths(MESES_PARA_RECONTATO);
		if (ultimaSessao == null || ultimaSessao.isAfter(limite)) {
			return false;
		}
		return ultimoContato == null || !ultimoContato.toLocalDate().isAfter(limite);
	}

	private static ContatoDetalhe detalheContato(ContatoCliente k) {
		Usuario u = k.getUsuario();
		return new ContatoDetalhe(k.getId(), k.getData(), u != null ? u.getId() : null, u != null ? u.getNome() : null,
				k.getObservacao());
	}

	private void preencher(Cliente c, ClienteDados d) {
		UsuarioAtual.exigirIdentificado();
		String nome = limpar(d.nome());
		if (nome.isEmpty()) {
			throw RegraException.invalido("Informe o nome do cliente.");
		}
		c.setNome(limitar(nome, 120, "O nome"));
		String telefone = limpar(d.telefone()).replaceAll("\\D", "");
		if (!telefone.isEmpty() && (telefone.length() < 10 || telefone.length() > 13)) {
			throw RegraException.invalido("Informe o telefone com DDD, por exemplo (16) 99999-9999.");
		}
		c.setTelefone(telefone.isEmpty() ? null : telefone);
		String instagram = limpar(d.instagram()).replaceFirst("^@", "");
		c.setInstagram(instagram.isEmpty() ? null : limitar(instagram.toLowerCase(Locale.ROOT), 60, "O Instagram"));
		c.setObservacoes(limitar(d.observacoes(), 1000, "As observações"));
	}

	private void preencherBasico(Tatuagem t, TatuagemDados d) {
		if (d.clienteId() == null) {
			throw RegraException.invalido("Escolha o cliente.");
		}
		String descricao = limpar(d.descricao());
		if (descricao.isEmpty()) {
			throw RegraException.invalido("Descreva a tatuagem.");
		}
		t.setCliente(cliente(d.clienteId()));
		t.setDescricao(limitar(descricao, 500, "A descrição"));
		t.setLocalCorpo(limitar(d.localCorpo(), 80, "O local do corpo"));
	}

	/** Sem permissão para ver os valores, o valor da sessão fica como estava. */
	private void preencher(SessaoTatuagem s, SessaoDados d, boolean alteraValor) {
		if (d.data() == null || d.hora() == null) {
			throw RegraException.invalido("Informe o dia e o horário da sessão.");
		}
		if (d.duracaoMinutos() != null && (d.duracaoMinutos() < 0 || d.duracaoMinutos() > 24 * 60)) {
			throw RegraException.invalido("A duração precisa ficar entre 0 e 24 horas.");
		}
		s.setData(d.data());
		s.setHora(d.hora());
		s.setDuracaoMinutos(d.duracaoMinutos());
		if (alteraValor) {
			s.setValor(naoNegativo(d.valor(), "O valor da sessão"));
		}
		if (d.status() != null) {
			s.setStatus(d.status());
		}
		s.setObservacao(limitar(d.observacao(), 500, "A observação"));
		if (d.responsavelId() != null) {
			s.setResponsavel(colaborador(d.responsavelId()));
		} else if (s.getResponsavel() == null) {
			s.setResponsavel(s.getTatuagem().getResponsavel());
		}
	}

	private void preencher(Pagamento p, PagamentoDados d) {
		if (d.valor() == null || d.valor().signum() <= 0) {
			throw RegraException.invalido("Informe um valor maior que zero.");
		}
		p.setData(d.data() != null ? d.data() : LocalDate.now());
		p.setValor(d.valor());
		p.setForma(limitar(d.forma(), 20, "A forma de pagamento"));
		p.setObservacao(limitar(d.observacao(), 200, "A observação"));
		p.setSinal(Boolean.TRUE.equals(d.sinal()));
		// Um pagamento comum já entrou; só o sinal pode estar combinado e ainda não pago.
		p.setPago(!p.isSinal() || !Boolean.FALSE.equals(d.pago()));
	}

	private Usuario euMesmo() {
		return em.find(Usuario.class, UsuarioAtual.get());
	}

	private Usuario colaborador(Long id) {
		Usuario u = id == null ? null : em.find(Usuario.class, id);
		if (u == null || !u.isAtivo()) {
			throw RegraException.naoEncontrado("Colaborador");
		}
		return u;
	}

	private Cliente cliente(Long id) {
		return buscar(Cliente.class, id, "Cliente");
	}

	private <T> T buscar(Class<T> tipo, Long id, String nome) {
		T achado = id == null ? null : em.find(tipo, id);
		if (achado == null) {
			throw RegraException.naoEncontrado(nome);
		}
		return achado;
	}

	@SuppressWarnings("unchecked")
	private static <V> Map<Long, V> mapa(jakarta.persistence.TypedQuery<Object[]> consulta) {
		Map<Long, V> mapa = new HashMap<>();
		consulta.getResultStream().forEach(l -> mapa.put((Long) l[0], (V) l[1]));
		return mapa;
	}

	private static BigDecimal naoNegativo(BigDecimal valor, String campo) {
		if (valor != null && valor.signum() < 0) {
			throw RegraException.invalido(campo + " não pode ser negativo.");
		}
		return valor;
	}

	private static String limitar(String texto, int maximo, String campo) {
		String limpo = limpar(texto);
		if (limpo.length() > maximo) {
			throw RegraException.invalido(campo + " pode ter até " + maximo + " caracteres.");
		}
		return limpo.isEmpty() ? null : limpo;
	}

	private static String limpar(String texto) {
		return texto == null ? "" : texto.trim();
	}
}
