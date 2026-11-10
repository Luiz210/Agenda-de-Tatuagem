package com.agenda.tatuagem.autenticacao;

import java.io.IOException;
import java.util.Optional;
import java.util.Set;

import org.springframework.context.annotation.Lazy;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/** Exige login em toda a API e informa ao Hibernate de quem são os dados. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class AutenticacaoFiltro extends OncePerRequestFilter {

	static final String PREFIXO = "Bearer ";
	private static final Set<String> ROTAS_PUBLICAS = Set.of("/auth/status", "/auth/cadastrar", "/auth/entrar");

	private final AutenticacaoService autenticacaoService;

	// Lazy: o servidor web cria os filtros antes de o JPA estar pronto.
	AutenticacaoFiltro(@Lazy AutenticacaoService autenticacaoService) {
		this.autenticacaoService = autenticacaoService;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest pedido, HttpServletResponse resposta, FilterChain cadeia)
			throws ServletException, IOException {
		if (ROTAS_PUBLICAS.contains(pedido.getRequestURI())) {
			cadeia.doFilter(pedido, resposta);
			return;
		}

		Optional<Long> usuario = tokenDoPedido(pedido).flatMap(autenticacaoService::usuarioDoToken);

		if (usuario.isEmpty()) {
			resposta.setStatus(HttpStatus.UNAUTHORIZED.value());
			return;
		}

		UsuarioAtual.set(usuario.get());
		try {
			cadeia.doFilter(pedido, resposta);
		} finally {
			UsuarioAtual.limpar();
		}
	}

	/**
	 * O token vem no cabeçalho. Só a leitura de imagens aceita o token no endereço,
	 * porque a tag img da tela não consegue enviar cabeçalhos.
	 */
	private static Optional<String> tokenDoPedido(HttpServletRequest pedido) {
		String cabecalho = pedido.getHeader("Authorization");
		if (cabecalho != null && cabecalho.startsWith(PREFIXO)) {
			return Optional.of(cabecalho.substring(PREFIXO.length()));
		}
		boolean leituraDeImagem = "GET".equals(pedido.getMethod()) && pedido.getRequestURI().startsWith("/imagens/");
		String token = pedido.getParameter("token");
		return leituraDeImagem && token != null ? Optional.of(token) : Optional.empty();
	}
}
