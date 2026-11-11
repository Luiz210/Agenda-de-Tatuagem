package com.agenda.tatuagem.autenticacao;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.Cadastro;
import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.Conta;
import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.Entrada;
import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.EntradaPin;
import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.Erro;
import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.Estado;
import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.NovoPin;
import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.Pessoa;
import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.SessaoAberta;

@RestController
@RequestMapping("auth")
public class AutenticacaoController {

	private final AutenticacaoService autenticacaoService;

	AutenticacaoController(AutenticacaoService autenticacaoService) {
		this.autenticacaoService = autenticacaoService;
	}

	/** Usado pelo aplicativo para saber se o back já terminou de iniciar. */
	@GetMapping("status")
	public ResponseEntity<Void> status() {
		return ResponseEntity.ok().build();
	}

	@GetMapping("estado")
	public Estado estado() {
		return autenticacaoService.estado();
	}

	@PostMapping("cadastrar")
	public SessaoAberta cadastrar(@RequestBody Cadastro dados) {
		return autenticacaoService.cadastrar(dados);
	}

	@PostMapping("entrar")
	public SessaoAberta entrar(@RequestBody Entrada dados) {
		return autenticacaoService.entrar(dados);
	}

	@PostMapping("pin")
	public SessaoAberta entrarComPin(@RequestBody EntradaPin dados) {
		return autenticacaoService.entrarComPin(dados.pin());
	}

	/** 204 quando ninguém está identificado no computador do estúdio. */
	@GetMapping("conta")
	public ResponseEntity<Conta> conta(@RequestHeader(name = "Authorization", required = false) String cabecalho) {
		return autenticacaoService.contaAtual(token(cabecalho))
				.map(ResponseEntity::ok)
				.orElseGet(() -> ResponseEntity.noContent().build());
	}

	@PutMapping("conta/pin")
	public ResponseEntity<Void> definirPin(@RequestBody NovoPin dados) {
		autenticacaoService.definirPin(dados.pin());
		return ResponseEntity.noContent().build();
	}

	@GetMapping("pessoas")
	public List<Pessoa> pessoas() {
		return autenticacaoService.pessoas();
	}

	@PostMapping("sair")
	public ResponseEntity<Void> sair(@RequestHeader(name = "Authorization", required = false) String cabecalho) {
		String token = token(cabecalho);
		if (token != null) {
			autenticacaoService.sair(token);
		}
		return ResponseEntity.ok().build();
	}

	private static String token(String cabecalho) {
		return cabecalho != null && cabecalho.startsWith(AutenticacaoFiltro.PREFIXO)
				? cabecalho.substring(AutenticacaoFiltro.PREFIXO.length())
				: null;
	}

	@ExceptionHandler(AutenticacaoException.class)
	public ResponseEntity<Erro> tratar(AutenticacaoException erro) {
		return ResponseEntity.status(erro.getStatus()).body(new Erro(erro.getMessage()));
	}
}
