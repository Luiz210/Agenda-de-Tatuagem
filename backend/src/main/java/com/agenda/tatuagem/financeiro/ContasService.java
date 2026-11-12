package com.agenda.tatuagem.financeiro;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.agenda.tatuagem.agenda.RegraException;
import com.agenda.tatuagem.arquivos.Arquivo;
import com.agenda.tatuagem.arquivos.Arquivos;
import com.agenda.tatuagem.autenticacao.UsuarioAtual;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.Baixa;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.CompraDados;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.CompraDetalhe;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.CompraResumo;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.ContaDados;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.ContaResumo;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.SituacaoConta;

import jakarta.persistence.EntityManager;

/**
 * Contas a pagar e compras parceladas. Cada parcela de uma compra é uma conta,
 * que aparece no mês do vencimento dela. Pagar uma conta lança a saída no caixa.
 */
@Service
@Transactional
public class ContasService {

	private static final int PARCELAS_MAXIMAS = 48;

	private final EntityManager em;
	private final Arquivos arquivos;
	private final CaixaService caixa;

	ContasService(EntityManager em, Arquivos arquivos, CaixaService caixa) {
		this.em = em;
		this.arquivos = arquivos;
		this.caixa = caixa;
	}

	// ---------- Contas ----------

	/**
	 * As contas do mês, por vencimento. No mês atual, as vencidas de meses
	 * anteriores que ainda não foram pagas aparecem no topo.
	 */
	@Transactional(readOnly = true)
	public List<ContaResumo> contas(LocalDate mes) {
		UsuarioAtual.exigirAdmin();
		LocalDate inicio = mes.withDayOfMonth(1);
		LocalDate fim = inicio.plusMonths(1).minusDays(1);
		boolean mesAtual = !LocalDate.now().isBefore(inicio) && !LocalDate.now().isAfter(fim);
		String atrasadas = mesAtual ? " or (c.pagaEm is null and c.vencimento < :inicio)" : "";
		return em.createQuery("select c from ContaPagar c left join fetch c.compra where (c.vencimento between :inicio"
				+ " and :fim)" + atrasadas + " order by c.vencimento, c.id", ContaPagar.class)
				.setParameter("inicio", inicio)
				.setParameter("fim", fim)
				.getResultStream()
				.map(this::resumo)
				.toList();
	}

	/** As que ainda não foram pagas, da mais antiga para a mais nova (vencidas primeiro). */
	@Transactional(readOnly = true)
	public List<ContaResumo> proximas(int quantas) {
		return em.createQuery("select c from ContaPagar c left join fetch c.compra where c.pagaEm is null"
				+ " order by c.vencimento, c.id", ContaPagar.class)
				.setMaxResults(quantas)
				.getResultStream()
				.map(this::resumo)
				.toList();
	}

	/** Quanto falta pagar até o fim do mês, contando as vencidas. */
	@Transactional(readOnly = true)
	public BigDecimal aPagarAte(LocalDate fim) {
		return em.createQuery("select coalesce(sum(c.valor), 0) from ContaPagar c where c.pagaEm is null"
				+ " and c.vencimento <= :fim", BigDecimal.class)
				.setParameter("fim", fim)
				.getSingleResult();
	}

	public ContaResumo criarConta(ContaDados dados) {
		UsuarioAtual.exigirAdmin();
		ContaPagar c = new ContaPagar();
		preencher(c, dados);
		c.setCriadoEm(LocalDateTime.now());
		em.persist(c);
		return resumo(c);
	}

	/** Uma parcela só tem a observação e o vencimento alterados; o valor vem da compra. */
	public ContaResumo alterarConta(Long id, ContaDados dados) {
		UsuarioAtual.exigirAdmin();
		ContaPagar c = conta(id);
		if (c.getCompra() != null) {
			if (dados.vencimento() != null) {
				c.setVencimento(dados.vencimento());
			}
			c.setObservacao(limitar(dados.observacao(), 500, "A observação"));
		} else {
			preencher(c, dados);
		}
		atualizarLancamento(c);
		return resumo(c);
	}

	/** Parcelas são removidas junto com a compra. */
	public void excluirConta(Long id) {
		UsuarioAtual.exigirAdmin();
		ContaPagar c = conta(id);
		if (c.getCompra() != null) {
			throw new RegraException(HttpStatus.CONFLICT,
					"Esta conta é parcela de uma compra. Para tirá-la, exclua ou altere a compra.");
		}
		remover(c);
	}

	/** Dá baixa: a conta fica paga e a saída entra no caixa na data do pagamento. */
	public ContaResumo pagar(Long id, Baixa baixa, String nomeArquivo, String tipo, byte[] comprovante) {
		UsuarioAtual.exigirAdmin();
		ContaPagar c = conta(id);
		if (c.isPaga()) {
			throw RegraException.invalido("Esta conta já foi paga.");
		}
		c.setPagaEm(baixa != null && baixa.data() != null ? baixa.data() : LocalDate.now());
		c.setForma(limitar(baixa != null ? baixa.forma() : null, 20, "A forma de pagamento"));
		if (comprovante != null && comprovante.length > 0) {
			trocar(c.getComprovante(), arquivos.salvar(nomeArquivo, tipo, comprovante, true), c::setComprovante);
		}
		caixa.registrar(TipoLancamento.SAIDA, OrigemLancamento.CONTA, "Conta: " + c.getNome(), c.getValor(),
				c.getPagaEm(), true, c.getId());
		return resumo(c);
	}

	/** Volta a conta para "a pagar" e tira a saída do caixa. O comprovante é descartado. */
	public ContaResumo desfazerPagamento(Long id) {
		UsuarioAtual.exigirAdmin();
		ContaPagar c = conta(id);
		c.setPagaEm(null);
		c.setForma(null);
		Arquivo comprovante = c.getComprovante();
		c.setComprovante(null);
		arquivos.remover(comprovante);
		caixa.removerDe(OrigemLancamento.CONTA, c.getId());
		return resumo(c);
	}

	public ContaResumo trocarFoto(Long id, String nome, String tipo, byte[] conteudo) {
		UsuarioAtual.exigirAdmin();
		ContaPagar c = conta(id);
		trocar(c.getFoto(), arquivos.salvar(nome, tipo, conteudo, true), c::setFoto);
		return resumo(c);
	}

	public ContaResumo trocarComprovante(Long id, String nome, String tipo, byte[] conteudo) {
		UsuarioAtual.exigirAdmin();
		ContaPagar c = conta(id);
		trocar(c.getComprovante(), arquivos.salvar(nome, tipo, conteudo, true), c::setComprovante);
		return resumo(c);
	}

	// ---------- Compras ----------

	@Transactional(readOnly = true)
	public List<CompraResumo> compras() {
		UsuarioAtual.exigirAdmin();
		return em.createQuery("select c from Compra c order by c.vencimento desc, c.id desc", Compra.class)
				.getResultStream()
				.map(this::resumo)
				.toList();
	}

	@Transactional(readOnly = true)
	public CompraDetalhe compra(Long id) {
		UsuarioAtual.exigirAdmin();
		Compra c = buscarCompra(id);
		return new CompraDetalhe(resumo(c), parcelasDe(c).stream().map(this::resumo).toList());
	}

	/** Cria a compra e as contas das parcelas, uma por mês a partir do primeiro vencimento. */
	public CompraDetalhe criarCompra(CompraDados dados) {
		UsuarioAtual.exigirAdmin();
		Compra c = new Compra();
		preencher(c, dados);
		c.setCriadoEm(LocalDateTime.now());
		em.persist(c);
		gerarParcelas(c);
		em.flush();
		return compra(c.getId());
	}

	/**
	 * Nome e observação sempre mudam. Valor, vencimento e parcelas só mudam
	 * enquanto nenhuma parcela foi paga, porque as parcelas são refeitas.
	 */
	public CompraDetalhe alterarCompra(Long id, CompraDados dados) {
		UsuarioAtual.exigirAdmin();
		Compra c = buscarCompra(id);
		List<ContaPagar> parcelas = parcelasDe(c);
		boolean algumaPaga = parcelas.stream().anyMatch(ContaPagar::isPaga);
		boolean mudouValores = dados.valorTotal() != null && dados.valorTotal().compareTo(c.getValorTotal()) != 0
				|| dados.vencimento() != null && !dados.vencimento().equals(c.getVencimento())
				|| dados.parcelas() != null && dados.parcelas() != c.getParcelas();
		if (mudouValores && algumaPaga) {
			throw new RegraException(HttpStatus.CONFLICT,
					"Já há parcelas pagas: o valor, o vencimento e as parcelas não podem mais mudar.");
		}
		preencher(c, dados);
		if (mudouValores) {
			parcelas.forEach(this::remover);
			em.flush();
			gerarParcelas(c);
		} else {
			// O nome das parcelas acompanha o da compra.
			parcelas.forEach(p -> p.setNome(nomeDaParcela(c, p.getParcela())));
		}
		em.flush();
		return compra(id);
	}

	/** Remove a compra, as parcelas e as saídas das parcelas já pagas. */
	public void excluirCompra(Long id) {
		UsuarioAtual.exigirAdmin();
		Compra c = buscarCompra(id);
		parcelasDe(c).forEach(this::remover);
		Arquivo comprovante = c.getComprovante();
		em.remove(c);
		arquivos.remover(comprovante);
	}

	public CompraResumo trocarComprovanteDaCompra(Long id, String nome, String tipo, byte[] conteudo) {
		UsuarioAtual.exigirAdmin();
		Compra c = buscarCompra(id);
		trocar(c.getComprovante(), arquivos.salvar(nome, tipo, conteudo, true), c::setComprovante);
		return resumo(c);
	}

	// ---------- Usado pelo painel (quem chama confere o perfil) ----------

	/** Contas avulsas (sem compra) com vencimento no período. */
	@Transactional(readOnly = true)
	public List<ContaResumo> avulsasEntre(LocalDate inicio, LocalDate fim) {
		return em.createQuery("select c from ContaPagar c where c.compra is null and c.vencimento between :i and :f"
				+ " order by c.vencimento", ContaPagar.class)
				.setParameter("i", inicio)
				.setParameter("f", fim)
				.getResultStream()
				.map(this::resumo)
				.toList();
	}

	/** A próxima conta a pagar, avulsa ou parcela: a vencida mais antiga, ou a que vence primeiro. */
	@Transactional(readOnly = true)
	public ContaResumo proximaAPagar(boolean parcela) {
		return em.createQuery("select c from ContaPagar c left join fetch c.compra where c.pagaEm is null and c.compra is "
				+ (parcela ? "not null" : "null") + " order by c.vencimento, c.id", ContaPagar.class)
				.setMaxResults(1)
				.getResultStream()
				.map(this::resumo)
				.findFirst()
				.orElse(null);
	}

	/** Compras cadastradas no período. */
	@Transactional(readOnly = true)
	public List<CompraResumo> comprasEntre(LocalDate inicio, LocalDate fim) {
		return em.createQuery("select c from Compra c where c.criadoEm >= :i and c.criadoEm < :f order by c.id",
				Compra.class)
				.setParameter("i", inicio.atStartOfDay())
				.setParameter("f", fim.plusDays(1).atStartOfDay())
				.getResultStream()
				.map(this::resumo)
				.toList();
	}

	/** Quanto foi pago no período: em contas avulsas ou em parcelas de compras. */
	@Transactional(readOnly = true)
	public BigDecimal pagoEntre(LocalDate inicio, LocalDate fim, boolean parcelas) {
		return em.createQuery("select coalesce(sum(c.valor), 0) from ContaPagar c where c.pagaEm between :i and :f"
				+ " and c.compra is " + (parcelas ? "not null" : "null"), BigDecimal.class)
				.setParameter("i", inicio)
				.setParameter("f", fim)
				.getSingleResult();
	}

	// ---------- Apoio ----------

	/** Divide o total; a última parcela absorve os centavos que sobram da divisão. */
	static List<BigDecimal> dividir(BigDecimal total, int parcelas) {
		BigDecimal parcela = total.divide(BigDecimal.valueOf(parcelas), 2, RoundingMode.DOWN);
		List<BigDecimal> valores = new ArrayList<>();
		for (int i = 1; i < parcelas; i++) {
			valores.add(parcela);
		}
		valores.add(total.subtract(parcela.multiply(BigDecimal.valueOf(parcelas - 1))));
		return valores;
	}

	private void gerarParcelas(Compra c) {
		List<BigDecimal> valores = dividir(c.getValorTotal(), c.getParcelas());
		for (int i = 1; i <= c.getParcelas(); i++) {
			ContaPagar p = new ContaPagar();
			p.setCompra(c);
			p.setParcela(i);
			p.setNome(nomeDaParcela(c, i));
			p.setValor(valores.get(i - 1));
			p.setVencimento(c.getVencimento().plusMonths(i - 1));
			p.setCriadoEm(LocalDateTime.now());
			em.persist(p);
		}
	}

	private static String nomeDaParcela(Compra c, Integer parcela) {
		String nome = c.getParcelas() > 1 ? c.getNome() + " (" + parcela + "/" + c.getParcelas() + ")" : c.getNome();
		return nome.length() > 150 ? nome.substring(0, 150) : nome;
	}

	private void remover(ContaPagar c) {
		caixa.removerDe(OrigemLancamento.CONTA, c.getId());
		Arquivo foto = c.getFoto();
		Arquivo comprovante = c.getComprovante();
		em.remove(c);
		arquivos.remover(foto);
		arquivos.remover(comprovante);
	}

	/** Se a conta paga mudou de nome ou valor, a saída no caixa acompanha. */
	private void atualizarLancamento(ContaPagar c) {
		if (!c.isPaga()) {
			return;
		}
		em.createQuery("select l from Lancamento l where l.origem = :o and l.referenciaId = :r", Lancamento.class)
				.setParameter("o", OrigemLancamento.CONTA)
				.setParameter("r", c.getId())
				.getResultStream()
				.forEach(l -> {
					l.setValor(c.getValor());
					l.setDescricao("Conta: " + c.getNome());
				});
	}

	private void trocar(Arquivo antigo, Arquivo novo, java.util.function.Consumer<Arquivo> guardar) {
		guardar.accept(novo);
		arquivos.remover(antigo);
	}

	private List<ContaPagar> parcelasDe(Compra c) {
		return em.createQuery("select p from ContaPagar p where p.compra = :c order by p.parcela", ContaPagar.class)
				.setParameter("c", c)
				.getResultList();
	}

	private ContaResumo resumo(ContaPagar c) {
		Compra compra = c.getCompra();
		return new ContaResumo(c.getId(), c.getNome(), c.getValor(), c.getVencimento(), c.getObservacao(),
				situacao(c, LocalDate.now()), c.getPagaEm(), c.getForma(), id(c.getFoto()), id(c.getComprovante()),
				compra != null ? compra.getId() : null, c.getParcela(), compra != null ? compra.getParcelas() : null);
	}

	private CompraResumo resumo(Compra c) {
		List<ContaPagar> parcelas = parcelasDe(c);
		List<ContaPagar> pagas = parcelas.stream().filter(ContaPagar::isPaga).toList();
		BigDecimal pago = pagas.stream().map(ContaPagar::getValor).reduce(BigDecimal.ZERO, BigDecimal::add);
		LocalDate proximo = parcelas.stream()
				.filter(p -> !p.isPaga())
				.map(ContaPagar::getVencimento)
				.min(LocalDate::compareTo)
				.orElse(null);
		return new CompraResumo(c.getId(), c.getNome(), c.getValorTotal(), c.getVencimento(), c.getParcelas(),
				c.getValorParcela(), c.getObservacao(), id(c.getComprovante()), pagas.size(), pago, proximo);
	}

	static SituacaoConta situacao(ContaPagar c, LocalDate hoje) {
		if (c.isPaga()) {
			return SituacaoConta.PAGA;
		}
		return c.getVencimento().isBefore(hoje) ? SituacaoConta.VENCIDA : SituacaoConta.ABERTA;
	}

	private static Long id(Arquivo a) {
		return a != null ? a.getId() : null;
	}

	private void preencher(ContaPagar c, ContaDados d) {
		String nome = limitar(d.nome(), 150, "O nome");
		if (nome == null) {
			throw RegraException.invalido("Informe o nome da conta.");
		}
		if (d.valor() == null || d.valor().signum() <= 0) {
			throw RegraException.invalido("Informe um valor maior que zero.");
		}
		if (d.vencimento() == null) {
			throw RegraException.invalido("Informe o vencimento.");
		}
		c.setNome(nome);
		c.setValor(d.valor());
		c.setVencimento(d.vencimento());
		c.setObservacao(limitar(d.observacao(), 500, "A observação"));
	}

	private void preencher(Compra c, CompraDados d) {
		String nome = limitar(d.nome(), 150, "O nome");
		if (nome == null) {
			throw RegraException.invalido("Informe o que foi comprado.");
		}
		if (d.valorTotal() == null || d.valorTotal().signum() <= 0) {
			throw RegraException.invalido("Informe o valor total, maior que zero.");
		}
		if (d.vencimento() == null) {
			throw RegraException.invalido("Informe o vencimento da primeira parcela.");
		}
		int parcelas = d.parcelas() != null ? d.parcelas() : 1;
		if (parcelas < 1 || parcelas > PARCELAS_MAXIMAS) {
			throw RegraException.invalido("As parcelas precisam ficar entre 1 e " + PARCELAS_MAXIMAS + ".");
		}
		c.setNome(nome);
		c.setValorTotal(d.valorTotal());
		c.setVencimento(d.vencimento());
		c.setParcelas(parcelas);
		c.setValorParcela(dividir(d.valorTotal(), parcelas).get(0));
		c.setObservacao(limitar(d.observacao(), 500, "A observação"));
	}

	private ContaPagar conta(Long id) {
		ContaPagar c = id == null ? null : em.find(ContaPagar.class, id);
		if (c == null) {
			throw RegraException.naoEncontrado("Conta");
		}
		return c;
	}

	private Compra buscarCompra(Long id) {
		Compra c = id == null ? null : em.find(Compra.class, id);
		if (c == null) {
			throw RegraException.naoEncontrado("Compra");
		}
		return c;
	}

	private static String limitar(String texto, int maximo, String campo) {
		String limpo = texto == null ? "" : texto.trim();
		if (limpo.length() > maximo) {
			throw RegraException.invalido(campo + " pode ter até " + maximo + " caracteres.");
		}
		return limpo.isEmpty() ? null : limpo;
	}
}
