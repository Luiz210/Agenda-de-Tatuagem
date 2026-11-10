package com.agenda.tatuagem.autenticacao;

/** Formatos de entrada e saída do login. */
public final class AutenticacaoDTOs {

	private AutenticacaoDTOs() {
	}

	public record Cadastro(String nome, String nomeUsuario, String email, String senha, String convite) {
	}

	public record Entrada(String identificador, String senha) {
	}

	public record Conta(Long id, String nome, String nomeUsuario, String email) {
		static Conta de(Usuario usuario) {
			return new Conta(usuario.getId(), usuario.getNome(), usuario.getNomeUsuario(), usuario.getEmail());
		}
	}

	/** O que as outras contas do mesmo servidor podem ver de cada pessoa. */
	public record Pessoa(Long id, String nome) {
	}

	public record SessaoAberta(String token, Conta conta) {
	}

	public record Erro(String mensagem) {
	}
}
