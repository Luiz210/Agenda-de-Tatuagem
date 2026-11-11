package com.agenda.tatuagem.estoque;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.agenda.tatuagem.agenda.RegraException;
import com.agenda.tatuagem.arquivos.Arquivo;
import com.agenda.tatuagem.arquivos.Arquivos;
import com.agenda.tatuagem.autenticacao.Usuario;
import com.agenda.tatuagem.autenticacao.UsuarioAtual;
import com.agenda.tatuagem.estoque.EstoqueDTOs.ItemDados;
import com.agenda.tatuagem.estoque.EstoqueDTOs.ItemResumo;
import com.agenda.tatuagem.estoque.EstoqueDTOs.MovimentoDados;
import com.agenda.tatuagem.estoque.EstoqueDTOs.MovimentoDetalhe;

import jakarta.persistence.EntityManager;

/**
 * Materiais do estúdio e produtos à venda. Todos veem e movimentam; os valores
 * das vendas (faturamento) só aparecem para administradores.
 */
@Service
@Transactional
public class EstoqueService {

	private final EntityManager em;
	private final Arquivos arquivos;

	EstoqueService(EntityManager em, Arquivos arquivos) {
		this.em = em;
		this.arquivos = arquivos;
	}

	// ---------- Itens ----------

	@Transactional(readOnly = true)
	public List<ItemResumo> listar(Categoria categoria) {
		var consulta = em.createQuery("select i from ItemEstoque i where i.ativo = true"
				+ (categoria != null ? " and i.categoria = :categoria" : "") + " order by lower(i.nome)",
				ItemEstoque.class);
		if (categoria != null) {
			consulta.setParameter("categoria", categoria);
		}
		List<ItemEstoque> itens = consulta.getResultList();
		Map<Long, Object[]> vendas = new HashMap<>();
		em.createQuery("select m.item.id, sum(m.quantidade), sum(m.valorTotal) from Movimento m"
				+ " where m.tipo = com.agenda.tatuagem.estoque.TipoMovimento.VENDA group by m.item.id", Object[].class)
				.getResultStream()
				.forEach(l -> vendas.put((Long) l[0], l));
		return itens.stream().map(i -> resumo(i, vendas.get(i.getId()))).toList();
	}

	@Transactional(readOnly = true)
	public ItemResumo item(Long id) {
		ItemEstoque i = buscar(id);
		Object[] vendas = em.createQuery("select m.item.id, sum(m.quantidade), sum(m.valorTotal) from Movimento m"
				+ " where m.item = :i and m.tipo = com.agenda.tatuagem.estoque.TipoMovimento.VENDA group by m.item.id",
				Object[].class)
				.setParameter("i", i)
				.getResultStream()
				.findFirst()
				.orElse(null);
		return resumo(i, vendas);
	}

	public ItemResumo criar(ItemDados dados) {
		UsuarioAtual.exigirIdentificado();
		if (dados.categoria() == null) {
			throw RegraException.invalido("Escolha se é um material do estúdio ou um produto.");
		}
		ItemEstoque i = new ItemEstoque();
		i.setCategoria(dados.categoria());
		preencher(i, dados);
		i.setCriadoEm(LocalDateTime.now());
		em.persist(i);
		int inicial = dados.quantidade() != null ? dados.quantidade() : 0;
		if (inicial < 0) {
			throw RegraException.invalido("A quantidade não pode ser negativa.");
		}
		if (inicial > 0) {
			registrar(i, TipoMovimento.ENTRADA, inicial, null, null, "Estoque inicial");
		}
		em.flush();
		return item(i.getId());
	}

	/** Nome, unidade, limiar, preço e observação. A quantidade só muda por movimentos. */
	public ItemResumo alterar(Long id, ItemDados dados) {
		UsuarioAtual.exigirIdentificado();
		ItemEstoque i = buscar(id);
		preencher(i, dados);
		return item(id);
	}

	public void excluir(Long id) {
		UsuarioAtual.exigirIdentificado();
		buscar(id).setAtivo(false);
	}

	public ItemResumo trocarImagem(Long id, String nome, String tipo, byte[] conteudo) {
		UsuarioAtual.exigirIdentificado();
		ItemEstoque i = buscar(id);
		Arquivo antiga = i.getImagem();
		i.setImagem(arquivos.salvar(nome, tipo, conteudo, false));
		arquivos.remover(antiga);
		return item(id);
	}

	public void removerImagem(Long id) {
		UsuarioAtual.exigirIdentificado();
		ItemEstoque i = buscar(id);
		Arquivo antiga = i.getImagem();
		i.setImagem(null);
		arquivos.remover(antiga);
	}

	// ---------- Movimentos ----------

	@Transactional(readOnly = true)
	public List<MovimentoDetalhe> movimentos(Long itemId) {
		ItemEstoque i = buscar(itemId);
		return em.createQuery("select m from Movimento m left join fetch m.usuario where m.item = :i"
				+ " order by m.data desc, m.id desc", Movimento.class)
				.setParameter("i", i)
				.setMaxResults(200)
				.getResultStream()
				.map(EstoqueService::detalhe)
				.toList();
	}

	/** Repor, dar baixa ou vender. A quantidade nunca fica negativa. */
	public ItemResumo movimentar(Long itemId, MovimentoDados dados) {
		UsuarioAtual.exigirIdentificado();
		ItemEstoque i = buscar(itemId);
		TipoMovimento tipo = dados.tipo();
		if (tipo == null) {
			throw RegraException.invalido("Escolha se é entrada, baixa ou venda.");
		}
		if (tipo == TipoMovimento.VENDA && i.getCategoria() != Categoria.PRODUTO) {
			throw RegraException.invalido("Só produtos podem ser vendidos. Para material usado, dê baixa.");
		}
		int quantidade = dados.quantidade() != null ? dados.quantidade() : 0;
		if (quantidade <= 0) {
			throw RegraException.invalido("Informe uma quantidade maior que zero.");
		}
		if (tipo != TipoMovimento.ENTRADA && quantidade > i.getQuantidade()) {
			throw RegraException.invalido("Só há " + i.getQuantidade() + " em estoque.");
		}
		BigDecimal unitario = null;
		if (tipo == TipoMovimento.VENDA) {
			unitario = dados.valorUnitario() != null ? dados.valorUnitario() : i.getPrecoVenda();
			if (unitario == null || unitario.signum() < 0) {
				throw RegraException.invalido("Informe o preço da venda.");
			}
		}
		registrar(i, tipo, quantidade, unitario, limitar(dados.forma(), 20, "A forma de pagamento"),
				limitar(dados.observacao(), 200, "A observação"));
		return item(itemId);
	}

	/** Desfaz um movimento lançado por engano, voltando a quantidade. */
	public ItemResumo estornar(Long movimentoId) {
		UsuarioAtual.exigirIdentificado();
		Movimento m = em.find(Movimento.class, movimentoId);
		if (m == null) {
			throw RegraException.naoEncontrado("Movimento");
		}
		ItemEstoque i = m.getItem();
		int nova = m.getTipo() == TipoMovimento.ENTRADA ? i.getQuantidade() - m.getQuantidade()
				: i.getQuantidade() + m.getQuantidade();
		if (nova < 0) {
			throw new RegraException(HttpStatus.CONFLICT,
					"Não dá para desfazer esta entrada: parte dela já saiu do estoque.");
		}
		i.setQuantidade(nova);
		em.remove(m);
		return item(i.getId());
	}

	// ---------- Apoio ----------

	private void registrar(ItemEstoque i, TipoMovimento tipo, int quantidade, BigDecimal unitario, String forma,
			String observacao) {
		Movimento m = new Movimento();
		m.setItem(i);
		m.setTipo(tipo);
		m.setQuantidade(quantidade);
		m.setValorUnitario(unitario);
		m.setValorTotal(unitario != null ? unitario.multiply(BigDecimal.valueOf(quantidade)) : null);
		m.setForma(forma);
		m.setData(LocalDateTime.now());
		m.setUsuario(UsuarioAtual.identificado() ? em.find(Usuario.class, UsuarioAtual.get()) : null);
		m.setObservacao(observacao);
		em.persist(m);
		i.setQuantidade(tipo == TipoMovimento.ENTRADA ? i.getQuantidade() + quantidade
				: i.getQuantidade() - quantidade);
	}

	private void preencher(ItemEstoque i, ItemDados d) {
		String nome = limitar(d.nome(), 120, "O nome");
		if (nome == null) {
			throw RegraException.invalido("Informe o nome.");
		}
		i.setNome(nome);
		i.setUnidade(limitar(d.unidade(), 20, "A unidade"));
		if (d.limiar() != null && d.limiar() < 0) {
			throw RegraException.invalido("O limiar de compra não pode ser negativo.");
		}
		if (i.getCategoria() == Categoria.INSUMO && d.limiar() == null) {
			throw RegraException.invalido("Informe o limiar de compra: com quantas unidades é hora de comprar mais.");
		}
		i.setLimiar(d.limiar());
		if (d.precoVenda() != null && d.precoVenda().signum() < 0) {
			throw RegraException.invalido("O preço não pode ser negativo.");
		}
		i.setPrecoVenda(i.getCategoria() == Categoria.PRODUTO ? d.precoVenda() : null);
		i.setObservacao(limitar(d.observacao(), 500, "A observação"));
	}

	/**
	 * Abaixo: chegou no limiar. Perto: até um quarto acima dele (pelo menos uma
	 * unidade), para dar tempo de comprar.
	 */
	static Situacao situacao(int quantidade, Integer limiar) {
		if (limiar == null) {
			return Situacao.OK;
		}
		if (quantidade <= limiar) {
			return Situacao.ABAIXO;
		}
		int margem = Math.max(1, (int) Math.ceil(limiar * 0.25));
		return quantidade <= limiar + margem ? Situacao.PROXIMO : Situacao.OK;
	}

	private static ItemResumo resumo(ItemEstoque i, Object[] vendas) {
		long vendidos = vendas != null && vendas[1] != null ? ((Number) vendas[1]).longValue() : 0;
		BigDecimal faturamento = vendas != null && vendas[2] != null ? (BigDecimal) vendas[2] : BigDecimal.ZERO;
		return new ItemResumo(i.getId(), i.getCategoria(), i.getNome(), i.getUnidade(), i.getQuantidade(),
				i.getLimiar(), i.getPrecoVenda(), i.getObservacao(), i.getImagem() != null ? i.getImagem().getId() : null,
				situacao(i.getQuantidade(), i.getLimiar()), vendidos, UsuarioAtual.admin() ? faturamento : null);
	}

	private static MovimentoDetalhe detalhe(Movimento m) {
		boolean admin = UsuarioAtual.admin();
		return new MovimentoDetalhe(m.getId(), m.getTipo(), m.getQuantidade(), admin ? m.getValorUnitario() : null,
				admin ? m.getValorTotal() : null, m.getForma(), m.getData(),
				m.getUsuario() != null ? m.getUsuario().getNome() : null, m.getObservacao());
	}

	private ItemEstoque buscar(Long id) {
		ItemEstoque i = id == null ? null : em.find(ItemEstoque.class, id);
		if (i == null || !i.isAtivo()) {
			throw RegraException.naoEncontrado("Item");
		}
		return i;
	}

	private static String limitar(String texto, int maximo, String campo) {
		String limpo = texto == null ? "" : texto.trim();
		if (limpo.length() > maximo) {
			throw RegraException.invalido(campo + " pode ter até " + maximo + " caracteres.");
		}
		return limpo.isEmpty() ? null : limpo;
	}
}
