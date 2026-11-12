package com.agenda.tatuagem.painel;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.agenda.tatuagem.agenda.AgendaDTOs.ClienteResumo;
import com.agenda.tatuagem.agenda.AgendaService;
import com.agenda.tatuagem.agenda.RegraException;
import com.agenda.tatuagem.autenticacao.UsuarioAtual;
import com.agenda.tatuagem.estoque.EstoqueService;
import com.agenda.tatuagem.estoque.ItemEstoque;
import com.agenda.tatuagem.estoque.Situacao;
import com.agenda.tatuagem.financeiro.AlugueisService;
import com.agenda.tatuagem.financeiro.ContasService;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.CompraResumo;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.ContaResumo;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.SituacaoConta;
import com.agenda.tatuagem.painel.PainelDTOs.ClienteSumido;
import com.agenda.tatuagem.painel.PainelDTOs.Financeiro;
import com.agenda.tatuagem.painel.PainelDTOs.IndicadoresCompras;
import com.agenda.tatuagem.painel.PainelDTOs.IndicadoresContas;
import com.agenda.tatuagem.painel.PainelDTOs.ItemAlerta;
import com.agenda.tatuagem.painel.PainelDTOs.Painel;
import com.agenda.tatuagem.painel.PainelDTOs.ProdutoVendido;
import com.agenda.tatuagem.painel.PainelDTOs.Resultado;

import jakarta.persistence.EntityManager;

/**
 * Junta os números das outras partes do aplicativo num período. Não guarda nada:
 * tudo é calculado na hora, a partir do que cada tela registrou.
 */
@Service
@Transactional(readOnly = true)
public class PainelService {

	private static final int TAMANHO_DAS_LISTAS = 8;
	private static final int TAMANHO_DO_RANKING = 5;

	private final EntityManager em;
	private final AgendaService agenda;
	private final ContasService contas;
	private final AlugueisService alugueis;

	PainelService(EntityManager em, AgendaService agenda, ContasService contas, AlugueisService alugueis) {
		this.em = em;
		this.agenda = agenda;
		this.contas = contas;
		this.alugueis = alugueis;
	}

	public Painel painel(LocalDate inicio, LocalDate fim) {
		if (inicio == null || fim == null || fim.isBefore(inicio)) {
			throw RegraException.invalido("Informe o início e o fim do período.");
		}
		boolean admin = UsuarioAtual.admin();

		List<ClienteResumo> sumidos = agenda.clientes()
				.stream()
				.filter(ClienteResumo::paraContatar)
				.sorted(Comparator.comparing(ClienteResumo::ultimaSessao))
				.toList();
		List<ProdutoVendido> ranking = ranking(inicio, fim, admin);
		long unidades = ranking.stream().mapToLong(ProdutoVendido::vendidos).sum();
		BigDecimal vendas = vendasEntre(inicio, fim);

		return new Painel(inicio, fim, sumidos.size(),
				sumidos.stream()
						.limit(TAMANHO_DAS_LISTAS)
						.map(c -> new ClienteSumido(c.id(), c.nome(), c.ultimaSessao()))
						.toList(),
				agenda.sessoesSemConfirmacao(), alertas(),
				ranking.stream().limit(TAMANHO_DO_RANKING).toList(), unidades, admin ? vendas : null,
				admin ? financeiro(inicio, fim, vendas) : null);
	}

	/** Materiais e produtos no limiar de compra ou perto dele; os que já passaram vêm primeiro. */
	private List<ItemAlerta> alertas() {
		return em.createQuery("select i from ItemEstoque i where i.ativo = true and i.limiar is not null",
				ItemEstoque.class)
				.getResultStream()
				.map(i -> new ItemAlerta(i.getId(), i.getCategoria(), i.getNome(), i.getQuantidade(), i.getLimiar(),
						i.getUnidade(), EstoqueService.situacao(i.getQuantidade(), i.getLimiar())))
				.filter(a -> a.situacao() != Situacao.OK)
				.sorted(Comparator.comparing((ItemAlerta a) -> a.situacao() == Situacao.ABAIXO ? 0 : 1)
						.thenComparing(ItemAlerta::nome))
				.toList();
	}

	/** Produtos mais vendidos no período, por unidades. */
	private List<ProdutoVendido> ranking(LocalDate inicio, LocalDate fim, boolean admin) {
		return em.createQuery("select m.item.id, m.item.nome, sum(m.quantidade), sum(m.valorTotal) from Movimento m"
				+ " where m.tipo = com.agenda.tatuagem.estoque.TipoMovimento.VENDA"
				+ " and m.data >= :i and m.data < :f group by m.item.id, m.item.nome"
				+ " order by sum(m.quantidade) desc, sum(m.valorTotal) desc", Object[].class)
				.setParameter("i", inicio.atStartOfDay())
				.setParameter("f", fim.plusDays(1).atStartOfDay())
				.getResultStream()
				.map(l -> new ProdutoVendido((Long) l[0], (String) l[1], ((Number) l[2]).longValue(),
						admin ? (l[3] != null ? (BigDecimal) l[3] : BigDecimal.ZERO) : null))
				.toList();
	}

	private BigDecimal vendasEntre(LocalDate inicio, LocalDate fim) {
		return em.createQuery("select coalesce(sum(m.valorTotal), 0) from Movimento m"
				+ " where m.tipo = com.agenda.tatuagem.estoque.TipoMovimento.VENDA and m.data >= :i and m.data < :f",
				BigDecimal.class)
				.setParameter("i", inicio.atStartOfDay())
				.setParameter("f", fim.plusDays(1).atStartOfDay())
				.getSingleResult();
	}

	private Financeiro financeiro(LocalDate inicio, LocalDate fim, BigDecimal vendas) {
		BigDecimal alugueisRecebidos = alugueis.recebidoEntre(inicio, fim);
		BigDecimal gastosContas = contas.pagoEntre(inicio, fim, false);
		BigDecimal gastosCompras = contas.pagoEntre(inicio, fim, true);
		BigDecimal outras = em.createQuery("select coalesce(sum(l.valor), 0) from Lancamento l"
				+ " where l.origem = com.agenda.tatuagem.financeiro.OrigemLancamento.AVULSO and l.realizado = true"
				+ " and l.data between :i and :f", BigDecimal.class)
				.setParameter("i", inicio)
				.setParameter("f", fim)
				.getSingleResult();
		Resultado resultado = new Resultado(alugueisRecebidos, vendas, gastosContas, gastosCompras,
				lucroLiquido(alugueisRecebidos, vendas, gastosContas, gastosCompras), outras);

		List<ContaResumo> doPeriodo = contas.avulsasEntre(inicio, fim);
		BigDecimal total = soma(doPeriodo);
		BigDecimal pago = soma(doPeriodo.stream().filter(c -> c.situacao() == SituacaoConta.PAGA).toList());
		ContaResumo maisCara = doPeriodo.stream().max(Comparator.comparing(ContaResumo::valor)).orElse(null);
		IndicadoresContas indicadoresContas = new IndicadoresContas(total, pago, total.subtract(pago),
				doPeriodo.size(), contas.proximaAPagar(false), maisCara);

		List<CompraResumo> compras = contas.comprasEntre(inicio, fim);
		IndicadoresCompras indicadoresCompras = new IndicadoresCompras(
				compras.stream().map(CompraResumo::valorTotal).reduce(BigDecimal.ZERO, BigDecimal::add), compras.size(),
				contas.proximaAPagar(true),
				compras.stream().max(Comparator.comparing(CompraResumo::valorTotal)).orElse(null));

		return new Financeiro(resultado, alugueis.emAberto(), alugueis.atrasados(), indicadoresContas,
				indicadoresCompras);
	}

	/** (Recebimento de colaboradores + venda de produtos) − (gastos com contas + gastos com compras). */
	static BigDecimal lucroLiquido(BigDecimal alugueis, BigDecimal vendas, BigDecimal contas, BigDecimal compras) {
		return alugueis.add(vendas).subtract(contas).subtract(compras);
	}

	private static BigDecimal soma(List<ContaResumo> contas) {
		return contas.stream().map(ContaResumo::valor).reduce(BigDecimal.ZERO, BigDecimal::add);
	}
}
