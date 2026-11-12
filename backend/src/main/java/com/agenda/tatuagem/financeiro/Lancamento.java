package com.agenda.tatuagem.financeiro;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/**
 * Uma entrada ou saída do caixa do estúdio. O saldo é a soma dos lançamentos
 * realizados: começa em zero e nunca é digitado. O valor das tatuagens não entra
 * aqui: é de cada tatuador.
 */
@Entity
@Table(name = "LANCAMENTO", indexes = { @Index(name = "IX_LANCAMENTO_DATA", columnList = "DATA"),
		@Index(name = "IX_LANCAMENTO_ORIGEM", columnList = "ORIGEM, REFERENCIA_ID") })
@Getter
@Setter
public class Lancamento {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 10)
	private TipoLancamento tipo;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 10)
	private OrigemLancamento origem;

	@Column(nullable = false, length = 200)
	private String descricao;

	@Column(nullable = false, precision = 12, scale = 2)
	private BigDecimal valor;

	/** Quando entrou ou saiu; para o que ainda vai entrar, a data prevista. */
	@Column(nullable = false)
	private LocalDate data;

	/** Falso só para uma entrada avulsa ainda a receber. */
	@Column(nullable = false)
	private boolean realizado;

	/** O registro que gerou o lançamento: a conta, o pagamento de aluguel ou a venda. */
	@Column(name = "REFERENCIA_ID")
	private Long referenciaId;

	@Column(nullable = false)
	private LocalDateTime criadoEm;
}
