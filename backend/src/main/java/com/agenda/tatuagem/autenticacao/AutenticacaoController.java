package com.agenda.tatuagem.autenticacao;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.Cadastro;
import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.Conta;
import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.Entrada;
import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.Erro;
import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.Pessoa;
import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.SessaoAberta;

import jakarta.servlet.http.HttpServletRequest;

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

	@PostMapping("cadastrar")
	public ResponseEntity<SessaoAberta> cadastrar(@RequestBody Cadastro dados, HttpServletRequest pedido) {
		return ResponseEntity.ok(autenticacaoService.cadastrar(dados, pedidoRemoto(pedido)));
	}

	@PostMapping("entrar")
	public ResponseEntity<SessaoAberta> entrar(@RequestBody Entrada dados) {
		return ResponseEntity.ok(autenticacaoService.entrar(dados));
	}

	@GetMapping("conta")
	public ResponseEntity<Conta> conta() {
		return ResponseEntity.ok(autenticacaoService.contaAtual());
	}

	@GetMapping("pessoas")
	public ResponseEntity<List<Pessoa>> pessoas() {
		return ResponseEntity.ok(autenticacaoService.pessoas());
	}

	@PostMapping("sair")
	public ResponseEntity<Void> sair(@RequestHeader("Authorization") String cabecalho) {
		autenticacaoService.sair(cabecalho.substring(AutenticacaoFiltro.PREFIXO.length()));
		return ResponseEntity.ok().build();
	}

	private static boolean pedidoRemoto(HttpServletRequest pedido) {
		try {
			return !InetAddress.getByName(pedido.getRemoteAddr()).isLoopbackAddress();
		} catch (UnknownHostException e) {
			return true;
		}
	}

	@ExceptionHandler(AutenticacaoException.class)
	public ResponseEntity<Erro> tratar(AutenticacaoException erro) {
		return ResponseEntity.status(erro.getStatus()).body(new Erro(erro.getMessage()));
	}
}
