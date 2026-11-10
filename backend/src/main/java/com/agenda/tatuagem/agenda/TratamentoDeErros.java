package com.agenda.tatuagem.agenda;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import com.agenda.tatuagem.agenda.AgendaDTOs.Erro;
import com.agenda.tatuagem.autenticacao.AutenticacaoException;

/** Devolve as falhas previstas com uma mensagem que a tela mostra como está. */
@RestControllerAdvice
public class TratamentoDeErros {

	@ExceptionHandler(RegraException.class)
	public ResponseEntity<Erro> regra(RegraException erro) {
		return ResponseEntity.status(erro.getStatus()).body(new Erro(erro.getMessage()));
	}

	@ExceptionHandler(AutenticacaoException.class)
	public ResponseEntity<Erro> autenticacao(AutenticacaoException erro) {
		return ResponseEntity.status(erro.getStatus()).body(new Erro(erro.getMessage()));
	}

	@ExceptionHandler(MaxUploadSizeExceededException.class)
	public ResponseEntity<Erro> arquivoGrande() {
		return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
				.body(new Erro("A imagem é grande demais. Envie uma de até 15 MB."));
	}
}
