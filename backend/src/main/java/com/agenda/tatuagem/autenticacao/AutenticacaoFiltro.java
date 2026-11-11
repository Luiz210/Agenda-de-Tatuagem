package com.agenda.tatuagem.autenticacao;

import java.io.IOException;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.Set;

import org.springframework.context.annotation.Lazy;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Exige login em toda a API e informa quem está fazendo cada pedido.
 *
 * No computador do estúdio (o que roda o servidor), qualquer um pode consultar
 * sem login; para alterar, a pessoa digita o código pessoal, que a identifica
 * por alguns minutos. Nos outros computadores o login continua normal.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class AutenticacaoFiltro extends OncePerRequestFilter {

	static final String PREFIXO = "Bearer ";
	private static final Set<String> ROTAS_PUBLICAS = Set.of("/auth/status", "/auth/estado", "/auth/cadastrar",
			"/auth/entrar", "/auth/pin");
	private static final Set<String> CONSULTAS = Set.of("GET", "HEAD", "OPTIONS");
	private static final String PEDIR_CODIGO = "{\"mensagem\":\"Digite seu código para continuar.\",\"codigo\":\"PIN\"}";

	private final AutenticacaoService autenticacaoService;

	// Lazy: o servidor web cria os filtros antes de o JPA estar pronto.
	AutenticacaoFiltro(@Lazy AutenticacaoService autenticacaoService) {
		this.autenticacaoService = autenticacaoService;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest pedido, HttpServletResponse resposta, FilterChain cadeia)
			throws ServletException, IOException {
		boolean estudio = pedidoDoProprioComputador(pedido);
		try {
			if (ROTAS_PUBLICAS.contains(pedido.getRequestURI())) {
				UsuarioAtual.set(UsuarioAtual.NENHUM, false, estudio);
				cadeia.doFilter(pedido, resposta);
				return;
			}

			Optional<Usuario> usuario = tokenDoPedido(pedido).flatMap(autenticacaoService::usuarioDoToken);
			if (usuario.isPresent()) {
				UsuarioAtual.set(usuario.get().getId(), usuario.get().isAdmin(), estudio);
				cadeia.doFilter(pedido, resposta);
				return;
			}

			if (estudio && CONSULTAS.contains(pedido.getMethod())) {
				UsuarioAtual.set(UsuarioAtual.NENHUM, false, true);
				cadeia.doFilter(pedido, resposta);
				return;
			}

			resposta.setStatus(HttpStatus.UNAUTHORIZED.value());
			if (estudio) {
				// A tela entende o código e abre o pedido do PIN em vez de voltar ao login.
				resposta.setContentType(MediaType.APPLICATION_JSON_VALUE);
				resposta.setCharacterEncoding(StandardCharsets.UTF_8.name());
				resposta.getWriter().write(PEDIR_CODIGO);
			}
		} finally {
			UsuarioAtual.limpar();
		}
	}

	private static boolean pedidoDoProprioComputador(HttpServletRequest pedido) {
		try {
			return InetAddress.getByName(pedido.getRemoteAddr()).isLoopbackAddress();
		} catch (UnknownHostException e) {
			return false;
		}
	}

	/**
	 * O token vem no cabeçalho. Só a leitura de imagens e arquivos aceita o token no
	 * endereço, porque a tag img da tela não consegue enviar cabeçalhos.
	 */
	private static Optional<String> tokenDoPedido(HttpServletRequest pedido) {
		String cabecalho = pedido.getHeader("Authorization");
		if (cabecalho != null && cabecalho.startsWith(PREFIXO)) {
			return Optional.of(cabecalho.substring(PREFIXO.length()));
		}
		boolean leituraDeImagem = "GET".equals(pedido.getMethod())
				&& (pedido.getRequestURI().startsWith("/imagens/") || pedido.getRequestURI().startsWith("/arquivos/"));
		String token = pedido.getParameter("token");
		return leituraDeImagem && token != null && !token.isEmpty() ? Optional.of(token) : Optional.empty();
	}
}
