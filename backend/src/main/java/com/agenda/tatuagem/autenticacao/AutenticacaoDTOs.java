package com.agenda.tatuagem.autenticacao;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** Formatos de entrada e saída do login e dos colaboradores. */
public final class AutenticacaoDTOs {

	private AutenticacaoDTOs() {
	}

	/** O PIN só é pedido no cadastro da primeira conta, feito no computador do estúdio. */
	public record Cadastro(String nome, String nomeUsuario, String email, String senha, String convite, String pin) {
	}

	public record Entrada(String identificador, String senha) {
	}

	public record EntradaPin(String pin) {
	}

	public record NovoPin(String pin) {
	}

	/** expiraEm só vem preenchido na identificação temporária do computador do estúdio. */
	public record Conta(Long id, String nome, String nomeUsuario, String email, Perfil perfil, String funcao,
			boolean temPin, LocalDateTime expiraEm) {
		static Conta de(Usuario u, LocalDateTime expiraEm) {
			return new Conta(u.getId(), u.getNome(), u.getNomeUsuario(), u.getEmail(), u.getPerfil(), u.getFuncao(),
					u.getPinHash() != null, expiraEm);
		}
	}

	/** O que todos podem ver de cada pessoa do estúdio. */
	public record Pessoa(Long id, String nome, String funcao) {
	}

	public record SessaoAberta(String token, Conta conta) {
	}

	/**
	 * estudio: a tela está no próprio computador do servidor, que funciona sem
	 * login e pede o código para alterar. temContas: falso só na primeira abertura.
	 */
	public record Estado(boolean estudio, boolean temContas) {
	}

	public record ColaboradorDados(String nome, String funcao, String telefone, BigDecimal valorAluguel,
			Integer diaPagamentoAluguel, Perfil perfil, String nomeUsuario, String email, String senha, String pin) {
	}

	/** Os dados do aluguel só vêm para administradores. */
	public record Colaborador(Long id, String nome, String funcao, String telefone, BigDecimal valorAluguel,
			Integer diaPagamentoAluguel, Perfil perfil, String nomeUsuario, String email, boolean temPin) {
	}

	public record Erro(String mensagem) {
	}
}
