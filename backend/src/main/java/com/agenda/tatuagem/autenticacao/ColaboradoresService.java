package com.agenda.tatuagem.autenticacao;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.Colaborador;
import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.ColaboradorDados;

import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

/** Cadastro das pessoas do estúdio. Só administradores alteram; todos veem a lista. */
@Service
@Transactional
public class ColaboradoresService {

	private final EntityManager em;
	private final AutenticacaoService autenticacao;

	ColaboradoresService(EntityManager em, AutenticacaoService autenticacao) {
		this.em = em;
		this.autenticacao = autenticacao;
	}

	public List<Colaborador> listar() {
		boolean admin = UsuarioAtual.admin();
		return em.createQuery("select u from Usuario u where u.ativo = true order by lower(u.nome)", Usuario.class)
				.getResultStream()
				.map(u -> resumo(u, admin))
				.toList();
	}

	public Colaborador criar(ColaboradorDados dados) {
		UsuarioAtual.exigirAdmin();
		Usuario u = new Usuario();
		preencher(u, dados);
		u.setSenhaHash(Senhas.gerarHash(Contas.senha(dados.senha())));
		String pin = Contas.pin(dados.pin());
		autenticacao.exigirPinLivre(pin, null);
		u.setPinHash(Senhas.gerarHashPin(pin));
		em.persist(u);
		return resumo(u, true);
	}

	/** Senha e código só mudam se vierem preenchidos. */
	public Colaborador alterar(Long id, ColaboradorDados dados) {
		UsuarioAtual.exigirAdmin();
		Usuario u = buscar(id);
		boolean eraAdmin = u.isAdmin();
		preencher(u, dados);
		if (eraAdmin && !u.isAdmin()) {
			exigirOutroAdmin(u.getId());
		}
		if (!Contas.limpar(dados.senha()).isEmpty()) {
			u.setSenhaHash(Senhas.gerarHash(Contas.senha(dados.senha())));
			autenticacao.encerrarSessoesDe(u.getId());
		}
		if (!Contas.limpar(dados.pin()).isEmpty()) {
			String pin = Contas.pin(dados.pin());
			autenticacao.exigirPinLivre(pin, u.getId());
			u.setPinHash(Senhas.gerarHashPin(pin));
		}
		return resumo(u, true);
	}

	/**
	 * A pessoa sai das listas e não consegue mais entrar, mas continua no histórico
	 * e nas tatuagens que fez. O usuário e o e-mail ficam livres para outro cadastro.
	 */
	public void excluir(Long id) {
		UsuarioAtual.exigirAdmin();
		Usuario u = buscar(id);
		if (u.isAdmin()) {
			exigirOutroAdmin(u.getId());
		}
		u.setAtivo(false);
		u.setPinHash(null);
		u.setEmail(null);
		String livre = u.getNomeUsuario() + "#" + u.getId();
		u.setNomeUsuario(livre.length() > 50 ? livre.substring(livre.length() - 50) : livre);
		autenticacao.encerrarSessoesDe(u.getId());
	}

	private void preencher(Usuario u, ColaboradorDados d) {
		u.setNome(Contas.nome(d.nome()));
		String nomeUsuario = Contas.nomeUsuario(d.nomeUsuario());
		autenticacao.exigirNomeUsuarioLivre(nomeUsuario, u.getId());
		u.setNomeUsuario(nomeUsuario);
		String email = Contas.email(d.email());
		autenticacao.exigirEmailLivre(email, u.getId());
		u.setEmail(email);
		u.setFuncao(limitar(d.funcao(), 60, "A função"));
		String telefone = Contas.limpar(d.telefone()).replaceAll("\\D", "");
		if (!telefone.isEmpty() && (telefone.length() < 10 || telefone.length() > 13)) {
			throw Contas.invalido("Informe o telefone com DDD, por exemplo (16) 99999-9999.");
		}
		u.setTelefone(telefone.isEmpty() ? null : telefone);
		BigDecimal aluguel = d.valorAluguel();
		if (aluguel != null && aluguel.signum() < 0) {
			throw Contas.invalido("O valor do aluguel não pode ser negativo.");
		}
		u.setValorAluguel(aluguel);
		// A cobrança começa no mês em que o aluguel foi informado pela primeira vez.
		if (aluguel != null && aluguel.signum() > 0 && u.getAluguelDesde() == null) {
			u.setAluguelDesde(java.time.LocalDate.now().withDayOfMonth(1));
		}
		Integer dia = d.diaPagamentoAluguel();
		if (dia != null && (dia < 1 || dia > 31)) {
			throw Contas.invalido("O dia de pagamento do aluguel precisa ficar entre 1 e 31.");
		}
		u.setDiaPagamentoAluguel(dia);
		u.setPerfil(d.perfil() != null ? d.perfil() : Perfil.PADRAO);
	}

	private void exigirOutroAdmin(Long ignorar) {
		Long outros = em.createQuery("select count(u) from Usuario u where u.ativo = true and u.perfil = :admin"
				+ " and u.id <> :id", Long.class)
				.setParameter("admin", Perfil.ADMIN)
				.setParameter("id", ignorar)
				.getSingleResult();
		if (outros == 0) {
			throw Contas.conflito("O estúdio precisa ter pelo menos um administrador.");
		}
	}

	private Usuario buscar(Long id) {
		Usuario u = id == null ? null : em.find(Usuario.class, id);
		if (u == null || !u.isAtivo()) {
			throw new AutenticacaoException(HttpStatus.NOT_FOUND, "Colaborador não encontrado.");
		}
		return u;
	}

	private static Colaborador resumo(Usuario u, boolean admin) {
		return new Colaborador(u.getId(), u.getNome(), u.getFuncao(), u.getTelefone(),
				admin ? u.getValorAluguel() : null, admin ? u.getDiaPagamentoAluguel() : null, u.getPerfil(),
				u.getNomeUsuario(), admin ? u.getEmail() : null, u.getPinHash() != null);
	}

	private static String limitar(String texto, int maximo, String campo) {
		String limpo = Contas.limpar(texto);
		if (limpo.length() > maximo) {
			throw Contas.invalido(campo + " pode ter até " + maximo + " caracteres.");
		}
		return limpo.isEmpty() ? null : limpo;
	}
}
