package com.agenda.tatuagem.autenticacao;

import java.util.Locale;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;

/** Regras dos dados de uma conta, usadas no cadastro e na tela de colaboradores. */
final class Contas {

	private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
	private static final Pattern NOME_USUARIO = Pattern.compile("^[a-zA-Z0-9._-]{3,50}$");
	private static final Pattern PIN = Pattern.compile("^\\d{4,6}$");
	static final int SENHA_MINIMA = 8;

	private Contas() {
	}

	static String nome(String texto) {
		String nome = limpar(texto);
		if (nome.isEmpty() || nome.length() > 100) {
			throw invalido("Informe o nome, com até 100 caracteres.");
		}
		return nome;
	}

	static String nomeUsuario(String texto) {
		String nomeUsuario = limpar(texto);
		if (!NOME_USUARIO.matcher(nomeUsuario).matches()) {
			throw invalido("O nome de usuário precisa ter de 3 a 50 letras, números, ponto, hífen ou sublinhado.");
		}
		return nomeUsuario;
	}

	/** O e-mail é opcional: vazio vira nulo. */
	static String email(String texto) {
		String email = limpar(texto).toLowerCase(Locale.ROOT);
		if (email.isEmpty()) {
			return null;
		}
		if (email.length() > 150 || !EMAIL.matcher(email).matches()) {
			throw invalido("Informe um e-mail válido ou deixe em branco.");
		}
		return email;
	}

	static String senha(String senha) {
		if (senha == null || senha.length() < SENHA_MINIMA) {
			throw invalido("A senha precisa ter pelo menos " + SENHA_MINIMA + " caracteres.");
		}
		return senha;
	}

	static String pin(String texto) {
		String pin = limpar(texto);
		if (!PIN.matcher(pin).matches()) {
			throw invalido("O código precisa ter de 4 a 6 números.");
		}
		return pin;
	}

	static String limpar(String texto) {
		return texto == null ? "" : texto.trim();
	}

	static AutenticacaoException invalido(String mensagem) {
		return new AutenticacaoException(HttpStatus.BAD_REQUEST, mensagem);
	}

	static AutenticacaoException conflito(String mensagem) {
		return new AutenticacaoException(HttpStatus.CONFLICT, mensagem);
	}
}
