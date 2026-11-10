package com.agenda.tatuagem.agenda;

import java.time.LocalDateTime;

import jakarta.persistence.Basic;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Lob;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** Referência, desenho ou foto do resultado de uma tatuagem. */
@Entity
@Table(name = "IMAGEM")
@Getter
@Setter
public class Imagem {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "TATUAGEM_ID", nullable = false)
	private Tatuagem tatuagem;

	@Column(nullable = false, length = 150)
	private String nome;

	@Column(nullable = false, length = 50)
	private String tipo;

	@Lob
	@Basic(fetch = FetchType.LAZY)
	@Column(nullable = false)
	private byte[] conteudo;

	@Column(nullable = false)
	private LocalDateTime criadoEm;
}
