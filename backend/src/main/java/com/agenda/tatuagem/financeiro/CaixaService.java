package com.agenda.tatuagem.financeiro;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.agenda.tatuagem.agenda.RegraException;
import com.agenda.tatuagem.autenticacao.UsuarioAtual;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.EntradaDados;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.LancamentoResumo;

import jakarta.persistence.EntityManager;

/**
 * O caixa do estúdio. As outras partes do aplicativo lançam aqui o dinheiro que
 * entra e sai (vendas, aluguéis, contas pagas); entradas avulsas são lançadas à mão.
 */
@Service
@Transactional
public class CaixaService {

	private final EntityManager em;

	CaixaService(EntityManager em) {
		this.em = em;
	}

	/** Usado pelas outras partes: não confere perfil, quem chama já conferiu. */
	public Lancamento registrar(TipoLancamento tipo, OrigemLancamento origem, String descricao, BigDecimal valor,
			LocalDate data, boolean realizado, Long referenciaId) {
		Lancamento l = new Lancamento();
		l.setTipo(tipo);
		l.setOrigem(origem);
		l.setDescricao(descricao.length() > 200 ? descricao.substring(0, 200) : descricao);
		l.setValor(valor);
		l.setData(data);
		l.setRealizado(realizado);
		l.setReferenciaId(referenciaId);
		l.setCriadoEm(LocalDateTime.now());
		em.persist(l);
		return l;
	}

	/** Desfaz o lançamento gerado por um registro (pagamento desfeito, venda estornada). */
	public void removerDe(OrigemLancamento origem, Long referenciaId) {
		em.createQuery("select l from Lancamento l where l.origem = :o and l.referenciaId = :r", Lancamento.class)
				.setParameter("o", origem)
				.setParameter("r", referenciaId)
				.getResultList()
				.forEach(em::remove);
	}

	/** Entradas menos saídas, só do que já aconteceu. Começa em zero. */
	@Transactional(readOnly = true)
	public BigDecimal saldo() {
		return soma(TipoLancamento.ENTRADA, null, null, true).subtract(soma(TipoLancamento.SAIDA, null, null, true));
	}

	@Transactional(readOnly = true)
	public BigDecimal soma(TipoLancamento tipo, LocalDate inicio, LocalDate fim, boolean realizado) {
		StringBuilder jpql = new StringBuilder(
				"select coalesce(sum(l.valor), 0) from Lancamento l where l.tipo = :tipo and l.realizado = :r");
		if (inicio != null) {
			jpql.append(" and l.data between :inicio and :fim");
		}
		var consulta = em.createQuery(jpql.toString(), BigDecimal.class)
				.setParameter("tipo", tipo)
				.setParameter("r", realizado);
		if (inicio != null) {
			consulta.setParameter("inicio", inicio).setParameter("fim", fim);
		}
		return consulta.getSingleResult();
	}

	// ---------- Usado pela tela ----------

	@Transactional(readOnly = true)
	public List<LancamentoResumo> lancamentos(LocalDate mes) {
		UsuarioAtual.exigirAdmin();
		LocalDate inicio = mes.withDayOfMonth(1);
		return em.createQuery("select l from Lancamento l where l.data between :inicio and :fim"
				+ " order by l.data desc, l.id desc", Lancamento.class)
				.setParameter("inicio", inicio)
				.setParameter("fim", inicio.plusMonths(1).minusDays(1))
				.getResultStream()
				.map(CaixaService::resumo)
				.toList();
	}

	/** Entradas avulsas ainda a receber, de qualquer mês. */
	@Transactional(readOnly = true)
	public List<LancamentoResumo> aReceber() {
		UsuarioAtual.exigirAdmin();
		return em.createQuery("select l from Lancamento l where l.realizado = false order by l.data", Lancamento.class)
				.getResultStream()
				.map(CaixaService::resumo)
				.toList();
	}

	@Transactional(readOnly = true)
	public List<LancamentoResumo> ultimos(int quantos) {
		return em.createQuery("select l from Lancamento l where l.realizado = true order by l.data desc, l.id desc",
				Lancamento.class)
				.setMaxResults(quantos)
				.getResultStream()
				.map(CaixaService::resumo)
				.toList();
	}

	/** Um ganho do estúdio que não vem de aluguel nem de venda, já recebido ou a receber. */
	public LancamentoResumo lancarEntrada(EntradaDados dados) {
		UsuarioAtual.exigirAdmin();
		String descricao = dados.descricao() == null ? "" : dados.descricao().trim();
		if (descricao.isEmpty() || descricao.length() > 200) {
			throw RegraException.invalido("Descreva a entrada, com até 200 caracteres.");
		}
		if (dados.valor() == null || dados.valor().signum() <= 0) {
			throw RegraException.invalido("Informe um valor maior que zero.");
		}
		return resumo(registrar(TipoLancamento.ENTRADA, OrigemLancamento.AVULSO, descricao, dados.valor(),
				dados.data() != null ? dados.data() : LocalDate.now(), !Boolean.FALSE.equals(dados.recebido()), null));
	}

	/** O valor a receber chegou: entra no saldo na data informada. */
	public LancamentoResumo receber(Long id, LocalDate data) {
		UsuarioAtual.exigirAdmin();
		Lancamento l = avulso(id);
		l.setRealizado(true);
		l.setData(data != null ? data : LocalDate.now());
		return resumo(l);
	}

	/** Só as entradas avulsas são removidas aqui; as outras se desfazem na tela de origem. */
	public void removerAvulso(Long id) {
		UsuarioAtual.exigirAdmin();
		em.remove(avulso(id));
	}

	private Lancamento avulso(Long id) {
		Lancamento l = id == null ? null : em.find(Lancamento.class, id);
		if (l == null) {
			throw RegraException.naoEncontrado("Lançamento");
		}
		if (l.getOrigem() != OrigemLancamento.AVULSO) {
			throw RegraException.invalido(
					"Este lançamento veio de uma conta, aluguel ou venda: desfaça por lá para o caixa acompanhar.");
		}
		return l;
	}

	static LancamentoResumo resumo(Lancamento l) {
		return new LancamentoResumo(l.getId(), l.getTipo(), l.getOrigem(), l.getDescricao(), l.getValor(),
				l.getData(), l.isRealizado(), l.getReferenciaId());
	}
}
