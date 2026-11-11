package com.agenda.tatuagem.autenticacao;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.Cadastro;
import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.Conta;
import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.Entrada;
import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.Estado;
import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.Pessoa;
import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.SessaoAberta;

import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

@Service
@Transactional
public class AutenticacaoService {

	/** Quanto tempo as alterações ficam no nome de quem digitou o código no estúdio. */
	static final Duration DURACAO_NO_ESTUDIO = Duration.ofMinutes(5);
	private static final int TENTATIVAS_DE_PIN = 5;
	private static final Duration BLOQUEIO_DE_PIN = Duration.ofMinutes(1);

	private final EntityManager entityManager;

	/** Exigido só de quem se cadastra por outro computador. */
	private final String codigoConvite;

	private int pinsErrados;
	private LocalDateTime pinBloqueadoAte;

	public AutenticacaoService(EntityManager entityManager,
			@Value("${agenda.codigo-convite:}") String codigoConvite) {
		this.entityManager = entityManager;
		this.codigoConvite = codigoConvite;
	}

	public Estado estado() {
		return new Estado(UsuarioAtual.estudio(), quantidadeDeContas() > 0);
	}

	/**
	 * De outro computador, qualquer um com o código de convite cria a própria conta.
	 * No computador do estúdio, só a primeira conta é criada assim (e vira
	 * administradora); as outras são cadastradas em Colaboradores.
	 */
	public SessaoAberta cadastrar(Cadastro dados) {
		boolean estudio = UsuarioAtual.estudio();
		boolean primeiraConta = quantidadeDeContas() == 0;

		if (!estudio && (codigoConvite.isEmpty() || !codigoConvite.equalsIgnoreCase(Contas.limpar(dados.convite())))) {
			throw new AutenticacaoException(HttpStatus.FORBIDDEN, "Código de convite incorreto.");
		}
		if (estudio && !primeiraConta) {
			throw new AutenticacaoException(HttpStatus.FORBIDDEN,
					"Neste computador, as novas contas são cadastradas por um administrador em Colaboradores.");
		}

		Usuario usuario = new Usuario();
		usuario.setNome(Contas.nome(dados.nome()));
		usuario.setNomeUsuario(Contas.nomeUsuario(dados.nomeUsuario()));
		usuario.setEmail(Contas.email(dados.email()));
		usuario.setSenhaHash(Senhas.gerarHash(Contas.senha(dados.senha())));
		usuario.setPerfil(primeiraConta ? Perfil.ADMIN : Perfil.PADRAO);
		if (estudio || !Contas.limpar(dados.pin()).isEmpty()) {
			String pin = Contas.pin(dados.pin());
			exigirPinLivre(pin, null);
			usuario.setPinHash(Senhas.gerarHashPin(pin));
		}
		exigirNomeUsuarioLivre(usuario.getNomeUsuario(), null);
		exigirEmailLivre(usuario.getEmail(), null);
		entityManager.persist(usuario);
		return abrirSessao(usuario, estudio);
	}

	/** No computador do estúdio, o login também vale só por alguns minutos, como o código. */
	public SessaoAberta entrar(Entrada dados) {
		String identificador = Contas.limpar(dados.identificador());
		Optional<Usuario> usuario = identificador.contains("@")
				? buscarPor("email", identificador.toLowerCase(Locale.ROOT))
				: buscarPor("nomeUsuario", identificador);

		if (usuario.isEmpty() || !usuario.get().isAtivo() || dados.senha() == null
				|| !Senhas.confere(dados.senha(), usuario.get().getSenhaHash())) {
			throw new AutenticacaoException(HttpStatus.UNAUTHORIZED, "Usuário ou senha incorretos.");
		}
		return abrirSessao(usuario.get(), UsuarioAtual.estudio());
	}

	/** Identifica quem está usando o computador do estúdio pelo código pessoal. */
	public synchronized SessaoAberta entrarComPin(String pinDigitado) {
		if (!UsuarioAtual.estudio()) {
			throw new AutenticacaoException(HttpStatus.FORBIDDEN, "O código só funciona no computador do estúdio.");
		}
		LocalDateTime agora = LocalDateTime.now();
		if (pinBloqueadoAte != null && agora.isBefore(pinBloqueadoAte)) {
			throw new AutenticacaoException(HttpStatus.TOO_MANY_REQUESTS,
					"Muitos códigos errados. Espere um minuto e tente de novo.");
		}
		String pin = Contas.limpar(pinDigitado);
		Optional<Usuario> dono = pin.isEmpty() ? Optional.empty() : donoDoPin(pin, null);
		if (dono.isEmpty()) {
			pinsErrados++;
			if (pinsErrados >= TENTATIVAS_DE_PIN) {
				pinsErrados = 0;
				pinBloqueadoAte = agora.plus(BLOQUEIO_DE_PIN);
			}
			throw new AutenticacaoException(HttpStatus.UNAUTHORIZED, "Código incorreto.");
		}
		pinsErrados = 0;
		return abrirSessao(dono.get(), true);
	}

	public void sair(String token) {
		Sessao sessao = entityManager.find(Sessao.class, Senhas.hashDoToken(token));
		if (sessao != null) {
			entityManager.remove(sessao);
		}
	}

	/** Devolve o dono do token, se a sessão existir, não tiver expirado e a pessoa continuar ativa. */
	public Optional<Usuario> usuarioDoToken(String token) {
		Sessao sessao = entityManager.find(Sessao.class, Senhas.hashDoToken(token));
		if (sessao == null) {
			return Optional.empty();
		}
		if (sessao.getExpiraEm() != null && LocalDateTime.now().isAfter(sessao.getExpiraEm())) {
			entityManager.remove(sessao);
			return Optional.empty();
		}
		Usuario usuario = entityManager.find(Usuario.class, sessao.getUsuarioId());
		return Optional.ofNullable(usuario).filter(Usuario::isAtivo);
	}

	/** Vazio quando ninguém está identificado no computador do estúdio. */
	public Optional<Conta> contaAtual(String token) {
		if (!UsuarioAtual.identificado()) {
			return Optional.empty();
		}
		LocalDateTime expiraEm = token == null ? null
				: Optional.ofNullable(entityManager.find(Sessao.class, Senhas.hashDoToken(token)))
						.map(Sessao::getExpiraEm)
						.orElse(null);
		return Optional.of(Conta.de(entityManager.find(Usuario.class, UsuarioAtual.get()), expiraEm));
	}

	/** Cada pessoa troca o próprio código. */
	public void definirPin(String pinNovo) {
		UsuarioAtual.exigirIdentificado();
		String pin = Contas.pin(pinNovo);
		exigirPinLivre(pin, UsuarioAtual.get());
		entityManager.find(Usuario.class, UsuarioAtual.get()).setPinHash(Senhas.gerarHashPin(pin));
	}

	public List<Pessoa> pessoas() {
		return entityManager
				.createQuery("select u from Usuario u where u.ativo = true order by lower(u.nome)", Usuario.class)
				.getResultStream()
				.map(u -> new Pessoa(u.getId(), u.getNome(), u.getFuncao()))
				.toList();
	}

	// ---------- Usado também pelos colaboradores ----------

	/** Dois colaboradores não podem ter o mesmo código, senão o estúdio não saberia quem é quem. */
	public void exigirPinLivre(String pin, Long ignorar) {
		if (donoDoPin(pin, ignorar).isPresent()) {
			throw Contas.conflito("Este código já é usado por outra pessoa. Escolha outro.");
		}
	}

	public void exigirNomeUsuarioLivre(String nomeUsuario, Long ignorar) {
		buscarPor("nomeUsuario", nomeUsuario).filter(u -> !u.getId().equals(ignorar)).ifPresent(u -> {
			throw Contas.conflito("Este nome de usuário já está em uso.");
		});
	}

	public void exigirEmailLivre(String email, Long ignorar) {
		if (email == null) {
			return;
		}
		buscarPor("email", email).filter(u -> !u.getId().equals(ignorar)).ifPresent(u -> {
			throw Contas.conflito("Este e-mail já está em uso.");
		});
	}

	public void encerrarSessoesDe(Long usuarioId) {
		entityManager.createQuery("select s from Sessao s where s.usuarioId = :id", Sessao.class)
				.setParameter("id", usuarioId)
				.getResultList()
				.forEach(entityManager::remove);
	}

	private Optional<Usuario> donoDoPin(String pin, Long ignorar) {
		return entityManager
				.createQuery("select u from Usuario u where u.ativo = true and u.pinHash is not null", Usuario.class)
				.getResultStream()
				.filter(u -> !u.getId().equals(ignorar))
				.filter(u -> Senhas.confere(pin, u.getPinHash()))
				.findFirst();
	}

	private long quantidadeDeContas() {
		return entityManager.createQuery("select count(u) from Usuario u", Long.class).getSingleResult();
	}

	private SessaoAberta abrirSessao(Usuario usuario, boolean temporaria) {
		String token = Senhas.gerarToken();
		LocalDateTime agora = LocalDateTime.now();
		// Os códigos do estúdio abrem uma sessão a cada uso; as vencidas não servem mais.
		entityManager.createQuery("delete from Sessao s where s.expiraEm < :agora")
				.setParameter("agora", agora)
				.executeUpdate();
		Sessao sessao = new Sessao();
		sessao.setTokenHash(Senhas.hashDoToken(token));
		sessao.setUsuarioId(usuario.getId());
		sessao.setCriadaEm(agora);
		sessao.setExpiraEm(temporaria ? agora.plus(DURACAO_NO_ESTUDIO) : null);
		entityManager.persist(sessao);
		return new SessaoAberta(token, Conta.de(usuario, sessao.getExpiraEm()));
	}

	private Optional<Usuario> buscarPor(String campo, String valor) {
		return entityManager
				.createQuery("select u from Usuario u where u." + campo + " = :valor", Usuario.class)
				.setParameter("valor", valor)
				.getResultStream()
				.findFirst();
	}
}
