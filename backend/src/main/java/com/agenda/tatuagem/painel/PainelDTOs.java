package com.agenda.tatuagem.painel;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import com.agenda.tatuagem.estoque.Categoria;
import com.agenda.tatuagem.estoque.Situacao;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.Atraso;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.CompraResumo;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.ContaResumo;

/** Os indicadores do painel do estúdio. Os valores em dinheiro só vêm para administradores. */
public final class PainelDTOs {

	private PainelDTOs() {
	}

	public record ClienteSumido(Long id, String nome, LocalDate ultimaSessao) {
	}

	public record ItemAlerta(Long id, Categoria categoria, String nome, int quantidade, Integer limiar,
			String unidade, Situacao situacao) {
	}

	/** faturamento vazio para quem não é administrador. */
	public record ProdutoVendido(Long id, String nome, long vendidos, BigDecimal faturamento) {
	}

	/** Contas avulsas do período (as parcelas de compras ficam em Compras). */
	public record IndicadoresContas(BigDecimal total, BigDecimal pago, BigDecimal emAberto, int quantidade,
			ContaResumo proxima, ContaResumo maisCara) {
	}

	/** Compras cadastradas no período e a próxima parcela a vencer, de qualquer compra. */
	public record IndicadoresCompras(BigDecimal total, int quantidade, ContaResumo proximaParcela,
			CompraResumo maisCara) {
	}

	/**
	 * O resultado do estúdio no período, pelo que de fato entrou e saiu:
	 * (aluguéis recebidos + vendas de produtos) − (contas pagas + parcelas de compras pagas).
	 * As entradas avulsas aparecem à parte e não entram na conta.
	 */
	public record Resultado(BigDecimal recebidoDeColaboradores, BigDecimal vendaDeProdutos,
			BigDecimal gastosComContas, BigDecimal gastosComCompras, BigDecimal lucroLiquido,
			BigDecimal outrasEntradas) {
	}

	public record Financeiro(Resultado resultado, BigDecimal aReceberDeColaboradores, List<Atraso> atrasados,
			IndicadoresContas contas, IndicadoresCompras compras) {
	}

	/** financeiro vem vazio para quem não é administrador. */
	public record Painel(LocalDate inicio, LocalDate fim, long totalParaContatar, List<ClienteSumido> paraContatar,
			long sessoesSemConfirmacao, List<ItemAlerta> alertas, List<ProdutoVendido> ranking, long unidadesVendidas,
			BigDecimal faturamentoProdutos, Financeiro financeiro) {
	}
}
