package com.agenda.tatuagem.estoque;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** Formatos de entrada e saída do estoque e dos produtos. */
public final class EstoqueDTOs {

	private EstoqueDTOs() {
	}

	/** quantidade só é lida na criação (vira a entrada "Estoque inicial"); depois, só por movimentos. */
	public record ItemDados(Categoria categoria, String nome, String unidade, Integer quantidade, Integer limiar,
			BigDecimal precoVenda, String observacao) {
	}

	/** vendidos: unidades vendidas desde sempre. faturamento: só para administradores. */
	public record ItemResumo(Long id, Categoria categoria, String nome, String unidade, int quantidade,
			Integer limiar, BigDecimal precoVenda, String observacao, Long imagemId, Situacao situacao,
			long vendidos, BigDecimal faturamento) {
	}

	/** valorUnitario vazio na venda usa o preço do produto. */
	public record MovimentoDados(TipoMovimento tipo, Integer quantidade, BigDecimal valorUnitario, String forma,
			String observacao) {
	}

	/** Os valores da venda só vêm para administradores. */
	public record MovimentoDetalhe(Long id, TipoMovimento tipo, int quantidade, BigDecimal valorUnitario,
			BigDecimal valorTotal, String forma, LocalDateTime data, String usuarioNome, String observacao) {
	}
}
