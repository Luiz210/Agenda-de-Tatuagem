package com.agenda.tatuagem.agenda;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/** Formatos de entrada e saída da agenda. */
public final class AgendaDTOs {

	private AgendaDTOs() {
	}

	public record ClienteDados(String nome, String telefone, String instagram, String observacoes) {
	}

	public record ClienteResumo(Long id, String nome, String telefone, String instagram, String observacoes,
			long tatuagens, BigDecimal totalPago, LocalDate ultimaSessao) {
	}

	public record Ficha(ClienteResumo cliente, List<TatuagemDetalhe> tatuagens) {
	}

	public record TatuagemDados(Long clienteId, String descricao, String localCorpo, BigDecimal valorTotal,
			SessaoDados primeiraSessao) {
	}

	public record TatuagemDetalhe(Long id, Long clienteId, String clienteNome, String clienteTelefone,
			String descricao, String localCorpo, BigDecimal valorTotal, BigDecimal totalPago,
			List<SessaoDetalhe> sessoes, List<PagamentoDetalhe> pagamentos, List<ImagemDetalhe> imagens) {
	}

	/** Na criação junto com a tatuagem, tatuagemId fica vazio. */
	public record SessaoDados(Long tatuagemId, LocalDate data, LocalTime hora, Integer duracaoMinutos,
			BigDecimal valor, StatusSessao status, String observacao) {
	}

	public record SessaoDetalhe(Long id, LocalDate data, LocalTime hora, Integer duracaoMinutos, BigDecimal valor,
			StatusSessao status, String observacao) {
	}

	/** Uma linha da agenda, com o que a tela precisa da tatuagem e do cliente. */
	public record SessaoAgenda(Long id, LocalDate data, LocalTime hora, Integer duracaoMinutos, BigDecimal valor,
			StatusSessao status, String observacao, Long tatuagemId, String descricao, String localCorpo,
			BigDecimal valorTotal, Long clienteId, String clienteNome, String clienteTelefone, int numero,
			int totalSessoes, Long imagemId) {
	}

	public record PagamentoDados(Long tatuagemId, LocalDate data, BigDecimal valor, String forma,
			String observacao) {
	}

	public record PagamentoDetalhe(Long id, LocalDate data, BigDecimal valor, String forma, String observacao) {
	}

	public record ImagemDetalhe(Long id, String nome, String tipo) {
	}

	public record Erro(String mensagem) {
	}
}
