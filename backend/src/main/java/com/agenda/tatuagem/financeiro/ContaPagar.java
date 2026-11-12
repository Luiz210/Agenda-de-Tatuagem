package com.agenda.tatuagem.financeiro;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

import com.agenda.tatuagem.arquivos.Arquivo;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** Uma conta do estúdio, avulsa ou parcela de uma compra. Paga quando pagaEm está preenchido. */
@Entity
@Table(name = "CONTA_PAGAR", indexes = @Index(name = "IX_CONTA_VENCIMENTO", columnList = "VENCIMENTO"))
@Getter
@Setter
public class ContaPagar {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, length = 150)
	private String nome;

	@Column(nullable = false, precision = 12, scale = 2)
	private BigDecimal valor;

	@Column(nullable = false)
	private LocalDate vencimento;

	@Column(length = 500)
	private String observacao;

	/** Foto ou PDF da conta (boleto, fatura). */
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "FOTO_ID")
	private Arquivo foto;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "COMPROVANTE_ID")
	private Arquivo comprovante;

	private LocalDate pagaEm;

	@Column(length = 20)
	private String forma;

	/** Preenchido quando a conta é parcela de uma compra. */
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "COMPRA_ID")
	private Compra compra;

	private Integer parcela;

	@Column(nullable = false)
	private LocalDateTime criadoEm;

	public boolean isPaga() {
		return pagaEm != null;
	}
}
