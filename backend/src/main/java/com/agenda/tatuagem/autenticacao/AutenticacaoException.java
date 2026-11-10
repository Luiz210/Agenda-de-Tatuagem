package com.agenda.tatuagem.autenticacao;

import org.springframework.http.HttpStatus;

import lombok.Getter;

/** Falha que pode ser mostrada na tela como está. */
@Getter
public class AutenticacaoException extends RuntimeException {

	private final HttpStatus status;

	public AutenticacaoException(HttpStatus status, String mensagem) {
		super(mensagem);
		this.status = status;
	}
}
