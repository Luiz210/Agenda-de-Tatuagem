package com.agenda.tatuagem.agenda;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import com.agenda.tatuagem.autenticacao.Usuario;

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

/** Um trabalho para um cliente, feito em uma ou mais sessões. */
@Entity
@Table(name = "TATUAGEM")
@Getter
@Setter
public class Tatuagem {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "CLIENTE_ID", nullable = false)
	private Cliente cliente;

	/** Quem faz a tatuagem. Os valores dela são só desta pessoa. */
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "RESPONSAVEL_ID")
	private Usuario responsavel;

	@Column(nullable = false, length = 500)
	private String descricao;

	@Column(length = 80)
	private String localCorpo;

	@Column(precision = 10, scale = 2)
	private BigDecimal valorTotal;

	@Column(nullable = false)
	private LocalDateTime criadoEm;

	@Column(nullable = false)
	private Long criadoPor;
}
