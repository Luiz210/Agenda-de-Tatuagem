package com.agenda.tatuagem.financeiro;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** Formatos de entrada e saída do financeiro. Tudo aqui é só para administradores. */
public final class FinanceiroDTOs {

	private FinanceiroDTOs() {
	}

	/** PAGA, ABERTA (ainda no prazo) ou VENCIDA. */
	public enum SituacaoConta {
		PAGA, ABERTA, VENCIDA
	}

	/** PAGO, A_VENCER ou ATRASADO. */
	public enum SituacaoAluguel {
		PAGO, A_VENCER, ATRASADO
	}

	// ---------- Contas ----------

	public record ContaDados(String nome, BigDecimal valor, LocalDate vencimento, String observacao) {
	}

	public record Baixa(LocalDate data, String forma) {
	}

	/** compraId e parcela vêm preenchidos quando a conta é parcela de uma compra. */
	public record ContaResumo(Long id, String nome, BigDecimal valor, LocalDate vencimento, String observacao,
			SituacaoConta situacao, LocalDate pagaEm, String forma, Long fotoId, Long comprovanteId, Long compraId,
			Integer parcela, Integer totalParcelas) {
	}

	// ---------- Compras ----------

	public record CompraDados(String nome, BigDecimal valorTotal, LocalDate vencimento, Integer parcelas,
			String observacao) {
	}

	public record CompraResumo(Long id, String nome, BigDecimal valorTotal, LocalDate vencimento, int parcelas,
			BigDecimal valorParcela, String observacao, Long comprovanteId, int parcelasPagas, BigDecimal valorPago,
			LocalDate proximoVencimento) {
	}

	public record CompraDetalhe(CompraResumo compra, List<ContaResumo> parcelas) {
	}

	// ---------- Aluguéis ----------

	public record AluguelDados(Long colaboradorId, LocalDate mes, LocalDate data, String forma, String observacao) {
	}

	/** O aluguel de um colaborador num mês. pagamentoId vazio enquanto não foi pago. */
	public record AluguelMes(Long colaboradorId, String colaboradorNome, BigDecimal valor, LocalDate vencimento,
			SituacaoAluguel situacao, Long pagamentoId, LocalDate pagoEm, String forma) {
	}

	/** Colaborador com aluguel atrasado: os meses em aberto e quanto deve. */
	public record Atraso(Long colaboradorId, String colaboradorNome, List<LocalDate> meses, BigDecimal total) {
	}

	// ---------- Caixa ----------

	public record EntradaDados(String descricao, BigDecimal valor, LocalDate data, Boolean recebido) {
	}

	public record LancamentoResumo(Long id, TipoLancamento tipo, OrigemLancamento origem, String descricao,
			BigDecimal valor, LocalDate data, boolean realizado, Long referenciaId) {
	}

	/**
	 * O painel do caixa. aReceber soma as entradas avulsas a receber e os
	 * aluguéis em aberto; aPagar, as contas não pagas até o fim do mês.
	 */
	public record Resumo(BigDecimal saldo, BigDecimal entradasDoMes, BigDecimal saidasDoMes, BigDecimal aReceber,
			BigDecimal aPagar, List<ContaResumo> proximasContas, List<Atraso> alugueisAtrasados,
			List<LancamentoResumo> ultimosLancamentos) {
	}
}
