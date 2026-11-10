package com.agenda.tatuagem.autenticacao;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.Cadastro;
import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.Conta;
import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.Entrada;
import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.Pessoa;
import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.SessaoAberta;

import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

@Service
@Transactional
public class AutenticacaoService {

	private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
	private static final Pattern NOME_USUARIO = Pattern.compile("^[a-zA-Z0-9._-]{3,50}$");
	private static final int SENHA_MINIMA = 8;

	private final EntityManager entityManager;

	/** Exigido só de quem se cadastra por outro computador. */
	private final String codigoConvite;

	public AutenticacaoService(EntityManager entityManager,
			@Value("${agenda.codigo-convite:}") String codigoConvite) {
		this.entityManager = entityManager;
		this.codigoConvite = codigoConvite;
	}

	public SessaoAberta cadastrar(Cadastro dados, boolean pedidoRemoto) {
		if (pedidoRemoto && (codigoConvite.isEmpty() || !codigoConvite.equalsIgnoreCase(limpar(dados.convite())))) {
			throw new AutenticacaoException(HttpStatus.FORBIDDEN, "Código de convite incorreto.");
		}

		String nome = limpar(dados.nome());
		String nomeUsuario = limpar(dados.nomeUsuario());
		String email = limpar(dados.email()).toLowerCase(Locale.ROOT);
		String senha = dados.senha() == null ? "" : dados.senha();

		if (nome.isEmpty() || nome.length() > 100) {
			throw invalido("Informe seu nome, com até 100 caracteres.");
		}
		if (!NOME_USUARIO.matcher(nomeUsuario).matches()) {
			throw invalido("O nome de usuário precisa ter de 3 a 50 letras, números, ponto, hífen ou sublinhado.");
		}
		if (email.length() > 150 || !EMAIL.matcher(email).matches()) {
			throw invalido("Informe um e-mail válido.");
		}
		if (senha.length() < SENHA_MINIMA) {
			throw invalido("A senha precisa ter pelo menos " + SENHA_MINIMA + " caracteres.");
		}
		if (buscarPor("nomeUsuario", nomeUsuario).isPresent()) {
			throw new AutenticacaoException(HttpStatus.CONFLICT, "Este nome de usuário já está em uso.");
		}
		if (buscarPor("email", email).isPresent()) {
			throw new AutenticacaoException(HttpStatus.CONFLICT, "Este e-mail já está em uso.");
		}

		Usuario usuario = new Usuario();
		usuario.setNome(nome);
		usuario.setNomeUsuario(nomeUsuario);
		usuario.setEmail(email);
		usuario.setSenhaHash(Senhas.gerarHash(senha));
		entityManager.persist(usuario);
		return abrirSessao(usuario);
	}

	public SessaoAberta entrar(Entrada dados) {
		String identificador = limpar(dados.identificador());
		Optional<Usuario> usuario = identificador.contains("@")
				? buscarPor("email", identificador.toLowerCase(Locale.ROOT))
				: buscarPor("nomeUsuario", identificador);

		if (usuario.isEmpty() || dados.senha() == null || !Senhas.confere(dados.senha(), usuario.get().getSenhaHash())) {
			throw new AutenticacaoException(HttpStatus.UNAUTHORIZED, "Usuário ou senha incorretos.");
		}
		return abrirSessao(usuario.get());
	}

	public void sair(String token) {
		Sessao sessao = entityManager.find(Sessao.class, Senhas.hashDoToken(token));
		if (sessao != null) {
			entityManager.remove(sessao);
		}
	}

	/** Devolve o id do usuário dono do token, se a sessão existir. */
	public Optional<Long> usuarioDoToken(String token) {
		Sessao sessao = entityManager.find(Sessao.class, Senhas.hashDoToken(token));
		return Optional.ofNullable(sessao).map(Sessao::getUsuarioId);
	}

	public Conta contaAtual() {
		return Conta.de(entityManager.find(Usuario.class, UsuarioAtual.get()));
	}

	public List<Pessoa> pessoas() {
		return entityManager.createQuery("select u from Usuario u order by u.id", Usuario.class)
				.getResultStream()
				.map(u -> new Pessoa(u.getId(), u.getNome()))
				.toList();
	}

	private SessaoAberta abrirSessao(Usuario usuario) {
		String token = Senhas.gerarToken();
		Sessao sessao = new Sessao();
		sessao.setTokenHash(Senhas.hashDoToken(token));
		sessao.setUsuarioId(usuario.getId());
		sessao.setCriadaEm(LocalDateTime.now());
		entityManager.persist(sessao);
		return new SessaoAberta(token, Conta.de(usuario));
	}

	private Optional<Usuario> buscarPor(String campo, String valor) {
		List<Usuario> encontrados = entityManager
				.createQuery("select u from Usuario u where u." + campo + " = :valor", Usuario.class)
				.setParameter("valor", valor)
				.getResultList();
		return encontrados.stream().findFirst();
	}

	private static String limpar(String texto) {
		return texto == null ? "" : texto.trim();
	}

	private static AutenticacaoException invalido(String mensagem) {
		return new AutenticacaoException(HttpStatus.BAD_REQUEST, mensagem);
	}
}
