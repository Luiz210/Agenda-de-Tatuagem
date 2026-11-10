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
import com.agenda.tatuagem.agenda.AgendaDTOs.Ficha;
import com.agenda.tatuagem.agenda.AgendaDTOs.ImagemDetalhe;
import com.agenda.tatuagem.agenda.AgendaDTOs.PagamentoDados;
import com.agenda.tatuagem.agenda.AgendaDTOs.PagamentoDetalhe;
import com.agenda.tatuagem.agenda.AgendaDTOs.SessaoAgenda;
import com.agenda.tatuagem.agenda.AgendaDTOs.SessaoDados;
import com.agenda.tatuagem.agenda.AgendaDTOs.SessaoDetalhe;
import com.agenda.tatuagem.agenda.AgendaDTOs.TatuagemDados;
import com.agenda.tatuagem.agenda.AgendaDTOs.TatuagemDetalhe;
import com.agenda.tatuagem.autenticacao.UsuarioAtual;

import jakarta.persistence.EntityManager;

/**
 * Clientes, tatuagens, sessões e pagamentos. Os dados são do estúdio: todas as
 * contas do mesmo servidor veem e alteram a mesma agenda.
 */
@Service
@Transactional
public class AgendaService {

	private final EntityManager em;

	AgendaService(EntityManager em) {
		this.em = em;
	}

	// ---------- Clientes ----------

	@Transactional(readOnly = true)
	public List<ClienteResumo> clientes() {
		List<Cliente> clientes = em.createQuery("select c from Cliente c order by lower(c.nome)", Cliente.class)
				.getResultList();
		Map<Long, Long> tatuagens = mapa("select t.cliente.id, count(t) from Tatuagem t group by t.cliente.id");
		Map<Long, BigDecimal> pagos = mapa(
				"select p.tatuagem.cliente.id, sum(p.valor) from Pagamento p group by p.tatuagem.cliente.id");
		Map<Long, LocalDate> ultimas = mapa("select s.tatuagem.cliente.id, max(s.data) from SessaoTatuagem s"
				+ " where s.status <> com.agenda.tatuagem.agenda.StatusSessao.CANCELADA group by s.tatuagem.cliente.id");
		return clientes.stream()
				.map(c -> resumo(c, tatuagens.getOrDefault(c.getId(), 0L), pagos.get(c.getId()),
						ultimas.get(c.getId())))
				.toList();
	}

	public ClienteResumo criarCliente(ClienteDados dados) {
		Cliente cliente = new Cliente();
		preencher(cliente, dados);
		cliente.setCriadoEm(LocalDateTime.now());
		cliente.setCriadoPor(UsuarioAtual.get());
		em.persist(cliente);
		return resumo(cliente, 0, null, null);
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
		BigDecimal pago = tatuagens.stream().map(TatuagemDetalhe::totalPago).reduce(BigDecimal.ZERO, BigDecimal::add);
		LocalDate ultima = tatuagens.stream()
				.flatMap(t -> t.sessoes().stream())
				.filter(s -> s.status() != StatusSessao.CANCELADA)
				.map(SessaoDetalhe::data)
				.max(LocalDate::compareTo)
				.orElse(null);
		return new Ficha(resumo(cliente, tatuagens.size(), pago, ultima), tatuagens);
	}

	// ---------- Tatuagens ----------

	@Transactional(readOnly = true)
	public TatuagemDetalhe tatuagem(Long id) {
		Tatuagem t = buscar(Tatuagem.class, id, "Tatuagem");
		List<SessaoDetalhe> sessoes = em.createQuery(
				"select s from SessaoTatuagem s where s.tatuagem = :t order by s.data, s.hora", SessaoTatuagem.class)
				.setParameter("t", t)
				.getResultStream()
				.map(AgendaService::detalhe)
				.toList();
		List<PagamentoDetalhe> pagamentos = em
				.createQuery("select p from Pagamento p where p.tatuagem = :t order by p.data, p.id", Pagamento.class)
				.setParameter("t", t)
				.getResultStream()
				.map(p -> new PagamentoDetalhe(p.getId(), p.getData(), p.getValor(), p.getForma(), p.getObservacao()))
				.toList();
		List<ImagemDetalhe> imagens = em.createQuery("select new com.agenda.tatuagem.agenda.AgendaDTOs$ImagemDetalhe("
				+ "i.id, i.nome, i.tipo) from Imagem i where i.tatuagem = :t order by i.id", ImagemDetalhe.class)
				.setParameter("t", t)
				.getResultList();
		BigDecimal pago = pagamentos.stream().map(PagamentoDetalhe::valor).reduce(BigDecimal.ZERO, BigDecimal::add);
		Cliente c = t.getCliente();
		return new TatuagemDetalhe(t.getId(), c.getId(), c.getNome(), c.getTelefone(), t.getDescricao(),
				t.getLocalCorpo(), t.getValorTotal(), pago, sessoes, pagamentos, imagens);
	}

	/** Cria a tatuagem e, se veio junto, a primeira sessão. */
	public TatuagemDetalhe criarTatuagem(TatuagemDados dados) {
		Tatuagem t = new Tatuagem();
		preencher(t, dados);
		t.setCriadoEm(LocalDateTime.now());
		t.setCriadoPor(UsuarioAtual.get());
		em.persist(t);
		if (dados.primeiraSessao() != null) {
			SessaoTatuagem s = new SessaoTatuagem();
			s.setTatuagem(t);
			preencher(s, dados.primeiraSessao());
			em.persist(s);
		}
		em.flush();
		return tatuagem(t.getId());
	}

	public void alterarTatuagem(Long id, TatuagemDados dados) {
		preencher(buscar(Tatuagem.class, id, "Tatuagem"), dados);
	}

	/** Remove a tatuagem com as sessões, os pagamentos e as imagens dela. */
	public void removerTatuagem(Long id) {
		Tatuagem t = buscar(Tatuagem.class, id, "Tatuagem");
		for (String entidade : List.of("Imagem", "Pagamento", "SessaoTatuagem")) {
			em.createQuery("delete from " + entidade + " x where x.tatuagem = :t").setParameter("t", t).executeUpdate();
		}
		em.remove(t);
	}

	// ---------- Sessões ----------

	@Transactional(readOnly = true)
	public List<SessaoAgenda> sessoes(LocalDate inicio, LocalDate fim) {
		if (inicio == null || fim == null || fim.isBefore(inicio)) {
			throw RegraException.invalido("Informe o início e o fim do período.");
		}
		return agenda(em.createQuery("select s from SessaoTatuagem s join fetch s.tatuagem t join fetch t.cliente"
				+ " where s.data between :inicio and :fim order by s.data, s.hora", SessaoTatuagem.class)
				.setParameter("inicio", inicio)
				.setParameter("fim", fim)
				.getResultList());
	}

	/** As próximas sessões ainda agendadas, a partir de um dia. */
	@Transactional(readOnly = true)
	public List<SessaoAgenda> proximas(LocalDate aPartirDe, int limite) {
		return agenda(em.createQuery("select s from SessaoTatuagem s join fetch s.tatuagem t join fetch t.cliente"
				+ " where s.data >= :dia and s.status = com.agenda.tatuagem.agenda.StatusSessao.AGENDADA"
				+ " order by s.data, s.hora", SessaoTatuagem.class)
				.setParameter("dia", aPartirDe)
				.setMaxResults(Math.max(1, Math.min(limite, 50)))
				.getResultList());
	}

	public SessaoDetalhe criarSessao(SessaoDados dados) {
		if (dados.tatuagemId() == null) {
			throw RegraException.invalido("Escolha a tatuagem desta sessão.");
		}
		SessaoTatuagem s = new SessaoTatuagem();
		s.setTatuagem(buscar(Tatuagem.class, dados.tatuagemId(), "Tatuagem"));
		preencher(s, dados);
		em.persist(s);
		return detalhe(s);
	}

	public SessaoDetalhe alterarSessao(Long id, SessaoDados dados) {
		SessaoTatuagem s = buscar(SessaoTatuagem.class, id, "Sessão");
		preencher(s, dados);
		return detalhe(s);
	}

	public void removerSessao(Long id) {
		em.remove(buscar(SessaoTatuagem.class, id, "Sessão"));
	}

	// ---------- Pagamentos ----------

	public PagamentoDetalhe criarPagamento(PagamentoDados dados) {
		if (dados.tatuagemId() == null) {
			throw RegraException.invalido("Escolha a tatuagem deste pagamento.");
		}
		if (dados.valor() == null || dados.valor().signum() <= 0) {
			throw RegraException.invalido("Informe um valor maior que zero.");
		}
		Pagamento p = new Pagamento();
		p.setTatuagem(buscar(Tatuagem.class, dados.tatuagemId(), "Tatuagem"));
		p.setData(dados.data() != null ? dados.data() : LocalDate.now());
		p.setValor(dados.valor());
		p.setForma(limitar(dados.forma(), 20, "A forma de pagamento"));
		p.setObservacao(limitar(dados.observacao(), 200, "A observação"));
		em.persist(p);
		return new PagamentoDetalhe(p.getId(), p.getData(), p.getValor(), p.getForma(), p.getObservacao());
	}

	public void removerPagamento(Long id) {
		em.remove(buscar(Pagamento.class, id, "Pagamento"));
	}

	// ---------- Imagens ----------

	public ImagemDetalhe adicionarImagem(Long tatuagemId, String nome, String tipo, byte[] conteudo) {
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
		em.remove(buscar(Imagem.class, id, "Imagem"));
	}

	// ---------- Apoio ----------

	private List<SessaoAgenda> agenda(List<SessaoTatuagem> sessoes) {
		if (sessoes.isEmpty()) {
			return List.of();
		}
		Collection<Long> tatuagens = sessoes.stream().map(s -> s.getTatuagem().getId()).distinct().toList();

		// Número da sessão dentro da tatuagem (1 de 3), sem contar as canceladas.
		Map<Long, List<Long>> ordem = new HashMap<>();
		em.createQuery("select s.tatuagem.id, s.id from SessaoTatuagem s where s.tatuagem.id in :ids"
				+ " and s.status <> com.agenda.tatuagem.agenda.StatusSessao.CANCELADA order by s.data, s.hora, s.id",
				Object[].class)
				.setParameter("ids", tatuagens)
				.getResultStream()
				.forEach(l -> ordem.computeIfAbsent((Long) l[0], k -> new ArrayList<>()).add((Long) l[1]));
		Map<Long, Long> capas = new HashMap<>();
		em.createQuery("select i.tatuagem.id, min(i.id) from Imagem i where i.tatuagem.id in :ids group by i.tatuagem.id",
				Object[].class)
				.setParameter("ids", tatuagens)
				.getResultStream()
				.forEach(l -> capas.put((Long) l[0], (Long) l[1]));

		return sessoes.stream().map(s -> {
			Tatuagem t = s.getTatuagem();
			Cliente c = t.getCliente();
			List<Long> daTatuagem = ordem.getOrDefault(t.getId(), List.of());
			return new SessaoAgenda(s.getId(), s.getData(), s.getHora(), s.getDuracaoMinutos(), s.getValor(),
					s.getStatus(), s.getObservacao(), t.getId(), t.getDescricao(), t.getLocalCorpo(), t.getValorTotal(),
					c.getId(), c.getNome(), c.getTelefone(), daTatuagem.indexOf(s.getId()) + 1, daTatuagem.size(),
					capas.get(t.getId()));
		}).toList();
	}

	private static SessaoDetalhe detalhe(SessaoTatuagem s) {
		return new SessaoDetalhe(s.getId(), s.getData(), s.getHora(), s.getDuracaoMinutos(), s.getValor(),
				s.getStatus(), s.getObservacao());
	}

	private static ClienteResumo resumo(Cliente c, long tatuagens, BigDecimal pago, LocalDate ultima) {
		return new ClienteResumo(c.getId(), c.getNome(), c.getTelefone(), c.getInstagram(), c.getObservacoes(),
				tatuagens, pago != null ? pago : BigDecimal.ZERO, ultima);
	}

	private void preencher(Cliente c, ClienteDados d) {
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

	private void preencher(Tatuagem t, TatuagemDados d) {
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
		t.setValorTotal(naoNegativo(d.valorTotal(), "O valor total"));
	}

	private void preencher(SessaoTatuagem s, SessaoDados d) {
		if (d.data() == null || d.hora() == null) {
			throw RegraException.invalido("Informe o dia e o horário da sessão.");
		}
		if (d.duracaoMinutos() != null && (d.duracaoMinutos() < 0 || d.duracaoMinutos() > 24 * 60)) {
			throw RegraException.invalido("A duração precisa ficar entre 0 e 24 horas.");
		}
		s.setData(d.data());
		s.setHora(d.hora());
		s.setDuracaoMinutos(d.duracaoMinutos());
		s.setValor(naoNegativo(d.valor(), "O valor da sessão"));
		if (d.status() != null) {
			s.setStatus(d.status());
		}
		s.setObservacao(limitar(d.observacao(), 500, "A observação"));
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
	private <V> Map<Long, V> mapa(String jpql) {
		Map<Long, V> mapa = new HashMap<>();
		em.createQuery(jpql, Object[].class).getResultStream().forEach(l -> mapa.put((Long) l[0], (V) l[1]));
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
