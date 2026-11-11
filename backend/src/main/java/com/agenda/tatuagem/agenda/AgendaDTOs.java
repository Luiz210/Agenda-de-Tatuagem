package com.agenda.tatuagem.agenda;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

/**
 * Formatos de entrada e saída da agenda. Os valores de uma tatuagem são do
 * tatuador responsável: para as outras pessoas eles vêm vazios.
 */
public final class AgendaDTOs {

	private AgendaDTOs() {
	}

	public record ClienteDados(String nome, String telefone, String instagram, String observacoes) {
	}

	/**
	 * totalPago soma só o que foi pago a quem está consultando. paraContatar: a
	 * última tatuagem foi há 6 meses ou mais e ninguém o procurou nesse tempo.
	 */
	public record ClienteResumo(Long id, String nome, String telefone, String instagram, String observacoes,
			long tatuagens, BigDecimal totalPago, LocalDate ultimaSessao, LocalDateTime ultimoContato,
			boolean paraContatar) {
	}

	public record Ficha(ClienteResumo cliente, List<TatuagemDetalhe> tatuagens, List<ContatoDetalhe> contatos) {
	}

	public record ContatoDados(String observacao) {
	}

	public record ContatoDetalhe(Long id, LocalDateTime data, Long usuarioId, String usuarioNome, String observacao) {
	}

	/**
	 * responsavelId vazio fica com quem cadastrou. sinal e sinalPago só são lidos na
	 * criação, junto com a primeira sessão.
	 */
	public record TatuagemDados(Long clienteId, Long responsavelId, String descricao, String localCorpo,
			BigDecimal valorTotal, SessaoDados primeiraSessao, BigDecimal sinal, Boolean sinalPago) {
	}

	public record TatuagemDetalhe(Long id, Long clienteId, String clienteNome, String clienteTelefone,
			Long responsavelId, String responsavelNome, boolean valoresVisiveis, String descricao, String localCorpo,
			BigDecimal valorTotal, BigDecimal totalPago, List<SessaoDetalhe> sessoes, List<PagamentoDetalhe> pagamentos,
			List<ImagemDetalhe> imagens) {
	}

	/** Na criação junto com a tatuagem, tatuagemId fica vazio. responsavelId vazio usa o da tatuagem. */
	public record SessaoDados(Long tatuagemId, Long responsavelId, LocalDate data, LocalTime hora,
			Integer duracaoMinutos, BigDecimal valor, StatusSessao status, String observacao) {
	}

	public record SessaoDetalhe(Long id, Long responsavelId, String responsavelNome, LocalDate data, LocalTime hora,
			Integer duracaoMinutos, BigDecimal valor, StatusSessao status, String observacao) {
	}

	/** Uma linha da agenda, com o que a tela precisa da tatuagem e do cliente. */
	public record SessaoAgenda(Long id, LocalDate data, LocalTime hora, Integer duracaoMinutos, BigDecimal valor,
			StatusSessao status, String observacao, Long tatuagemId, String descricao, String localCorpo,
			BigDecimal valorTotal, Long clienteId, String clienteNome, String clienteTelefone, int numero,
			int totalSessoes, Long imagemId, Long responsavelId, String responsavelNome, boolean valoresVisiveis,
			SinalResumo sinal) {
	}

	/** Situação do sinal da tatuagem, para a agenda avisar quando ele ainda não foi pago. */
	public record SinalResumo(BigDecimal valor, boolean pago) {
	}

	public record PagamentoDados(Long tatuagemId, LocalDate data, BigDecimal valor, String forma, String observacao,
			Boolean sinal, Boolean pago) {
	}

	public record PagamentoDetalhe(Long id, LocalDate data, BigDecimal valor, String forma, String observacao,
			boolean sinal, boolean pago) {
	}

	public record ImagemDetalhe(Long id, String nome, String tipo) {
	}

	public record Erro(String mensagem) {
	}
}
