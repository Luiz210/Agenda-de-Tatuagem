package com.agenda.tatuagem.agenda;

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

/** Uma vez em que o estúdio procurou um cliente que estava sumido. */
@Entity
@Table(name = "CONTATO_CLIENTE")
@Getter
@Setter
public class ContatoCliente {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "CLIENTE_ID", nullable = false)
	private Cliente cliente;

	@Column(nullable = false)
	private LocalDateTime data;

	/** Quem fez o contato. */
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "USUARIO_ID")
	private Usuario usuario;

	@Column(length = 500)
	private String observacao;
}
