package com.agenda.tatuagem.agenda;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;

import com.agenda.tatuagem.autenticacao.Usuario;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** Um horário na agenda para trabalhar em uma tatuagem. */
@Entity
@Table(name = "SESSAO_TATUAGEM")
@Getter
@Setter
public class SessaoTatuagem {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "TATUAGEM_ID", nullable = false)
	private Tatuagem tatuagem;

	/** Quem atende nesta sessão. Normalmente o mesmo da tatuagem. */
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "RESPONSAVEL_ID")
	private Usuario responsavel;

	@Column(nullable = false)
	private LocalDate data;

	@Column(nullable = false)
	private LocalTime hora;

	private Integer duracaoMinutos;

	/** Quanto se espera receber nesta sessão. */
	@Column(precision = 10, scale = 2)
	private BigDecimal valor;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private StatusSessao status = StatusSessao.AGENDADA;

	@Column(length = 500)
	private String observacao;
}
