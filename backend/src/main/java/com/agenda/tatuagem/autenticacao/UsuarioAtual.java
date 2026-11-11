package com.agenda.tatuagem.autenticacao;

import org.springframework.http.HttpStatus;

/** Quem está fazendo a requisição em andamento. Preenchido pelo filtro de autenticação. */
public final class UsuarioAtual {

	/** Valor usado quando ninguém se identificou; nenhuma conta tem esse id. */
	public static final Long NENHUM = 0L;

	private record Atual(Long id, boolean admin, boolean estudio) {
	}

	private static final ThreadLocal<Atual> ATUAL = new ThreadLocal<>();

	private UsuarioAtual() {
	}

	public static Long get() {
		Atual atual = ATUAL.get();
		return atual != null ? atual.id() : NENHUM;
	}

	/** Se alguém se identificou (login ou PIN). Consultas no computador do estúdio podem vir sem ninguém. */
	public static boolean identificado() {
		return !NENHUM.equals(get());
	}

	public static boolean admin() {
		Atual atual = ATUAL.get();
		return atual != null && atual.admin();
	}

	/** Se o pedido veio do próprio computador do estúdio (o que roda o servidor). */
	public static boolean estudio() {
		Atual atual = ATUAL.get();
		return atual != null && atual.estudio();
	}

	public static void exigirAdmin() {
		if (!admin()) {
			throw new AutenticacaoException(HttpStatus.FORBIDDEN, "Só um administrador pode fazer isso.");
		}
	}

	public static void exigirIdentificado() {
		if (!identificado()) {
			throw new AutenticacaoException(HttpStatus.UNAUTHORIZED, "Digite seu código para continuar.");
		}
	}

	public static void set(Long id, boolean admin, boolean estudio) {
		ATUAL.set(new Atual(id, admin, estudio));
	}

	public static void limpar() {
		ATUAL.remove();
	}
}
