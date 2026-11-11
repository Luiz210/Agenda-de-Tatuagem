package com.agenda.tatuagem.agenda;

import java.math.BigDecimal;
import java.time.LocalDate;

import org.hibernate.annotations.ColumnDefault;

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

/** Parte do valor de uma tatuagem: o sinal ou um pagamento recebido. */
@Entity
@Table(name = "PAGAMENTO")
@Getter
@Setter
public class Pagamento {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "TATUAGEM_ID", nullable = false)
	private Tatuagem tatuagem;

	@Column(nullable = false)
	private LocalDate data;

	@Column(nullable = false, precision = 10, scale = 2)
	private BigDecimal valor;

	@Column(length = 20)
	private String forma;

	@Column(length = 200)
	private String observacao;

	/** Adiantamento combinado para reservar o horário. */
	@ColumnDefault("false")
	@Column(nullable = false)
	private boolean sinal;

	/** Falso só para um sinal combinado que ainda não foi pago. */
	@ColumnDefault("true")
	@Column(nullable = false)
	private boolean pago = true;
}
