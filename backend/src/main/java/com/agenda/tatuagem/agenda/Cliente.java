package com.agenda.tatuagem.agenda;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "CLIENTE")
@Getter
@Setter
public class Cliente {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, length = 120)
	private String nome;

	/** Só os números, com DDD. Opcional: sem ele não há envio pelo WhatsApp. */
	@Column(length = 20)
	private String telefone;

	@Column(length = 60)
	private String instagram;

	@Column(length = 1000)
	private String observacoes;

	@Column(nullable = false)
	private LocalDateTime criadoEm;

	@Column(nullable = false)
	private Long criadoPor;
}
