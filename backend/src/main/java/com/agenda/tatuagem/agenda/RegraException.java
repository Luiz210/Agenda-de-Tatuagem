package com.agenda.tatuagem.agenda;

import org.springframework.http.HttpStatus;

import lombok.Getter;

/** Falha que pode ser mostrada na tela como está. */
@Getter
public class RegraException extends RuntimeException {

	private final HttpStatus status;

	public RegraException(HttpStatus status, String mensagem) {
		super(mensagem);
		this.status = status;
	}

	public static RegraException invalido(String mensagem) {
		return new RegraException(HttpStatus.BAD_REQUEST, mensagem);
	}

	public static RegraException naoEncontrado(String oque) {
		return new RegraException(HttpStatus.NOT_FOUND, oque + " não encontrado.");
	}
}
