package com.agenda.tatuagem.autenticacao;

/** Usuário da requisição em andamento, lido pelo filtro e usado pelo Hibernate. */
public final class UsuarioAtual {

	/** Valor usado nas rotas sem login; nenhuma conta tem esse id. */
	public static final Long NENHUM = 0L;

	private static final ThreadLocal<Long> ATUAL = new ThreadLocal<>();

	private UsuarioAtual() {
	}

	public static Long get() {
		Long id = ATUAL.get();
		return id != null ? id : NENHUM;
	}

	public static void set(Long id) {
		ATUAL.set(id);
	}

	public static void limpar() {
		ATUAL.remove();
	}
}
