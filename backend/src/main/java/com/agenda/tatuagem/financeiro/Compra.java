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
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** Uma compra do estúdio. Cada parcela vira uma conta a pagar, no mês dela. */
@Entity
@Table(name = "COMPRA")
@Getter
@Setter
public class Compra {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, length = 150)
	private String nome;

	@Column(nullable = false, precision = 12, scale = 2)
	private BigDecimal valorTotal;

	/** Vencimento da primeira parcela; as outras vencem no mesmo dia dos meses seguintes. */
	@Column(nullable = false)
	private LocalDate vencimento;

	@Column(nullable = false)
	private int parcelas;

	@Column(nullable = false, precision = 12, scale = 2)
	private BigDecimal valorParcela;

	@Column(length = 500)
	private String observacao;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "COMPROVANTE_ID")
	private Arquivo comprovante;

	@Column(nullable = false)
	private LocalDateTime criadoEm;
}
