package com.agenda.tatuagem.financeiro;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.agenda.tatuagem.agenda.RegraException;
import com.agenda.tatuagem.autenticacao.Usuario;
import com.agenda.tatuagem.autenticacao.UsuarioAtual;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.AluguelDados;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.AluguelMes;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.Atraso;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.SituacaoAluguel;

import jakarta.persistence.EntityManager;

/**
 * Aluguel dos colaboradores: mensal, pago de uma vez, com vencimento no dia
 * combinado. Fica atrasado no dia seguinte ao vencimento. Receber o aluguel
 * lança a entrada no caixa.
 */
@Service
@Transactional
public class AlugueisService {

	private final EntityManager em;
	private final CaixaService caixa;

	AlugueisService(EntityManager em, CaixaService caixa) {
		this.em = em;
		this.caixa = caixa;
	}

	/** O aluguel de cada colaborador no mês: pago, a vencer ou atrasado. */
	@Transactional(readOnly = true)
	public List<AluguelMes> doMes(LocalDate mes) {
		UsuarioAtual.exigirAdmin();
		return calcularMes(mes);
	}

	private List<AluguelMes> calcularMes(LocalDate mes) {
		LocalDate competencia = mes.withDayOfMonth(1);
		Map<Long, PagamentoAluguel> pagos = new HashMap<>();
		em.createQuery("select p from PagamentoAluguel p where p.competencia = :m", PagamentoAluguel.class)
				.setParameter("m", competencia)
				.getResultStream()
				.forEach(p -> pagos.put(p.getColaborador().getId(), p));
		LocalDate hoje = LocalDate.now();
		List<AluguelMes> lista = new ArrayList<>();
		for (Usuario u : comAluguel()) {
			if (u.getAluguelDesde() != null && u.getAluguelDesde().isAfter(competencia)) {
				continue;
			}
			PagamentoAluguel p = pagos.get(u.getId());
			LocalDate vencimento = vencimento(u, competencia);
			lista.add(new AluguelMes(u.getId(), u.getNome(), p != null ? p.getValor() : u.getValorAluguel(),
					vencimento, situacao(p != null, vencimento, hoje), p != null ? p.getId() : null,
					p != null ? p.getPagoEm() : null, p != null ? p.getForma() : null));
		}
		return lista;
	}

	/**
	 * Quem está devendo: meses desde o início da cobrança até hoje, já vencidos e
	 * sem pagamento.
	 */
	@Transactional(readOnly = true)
	public List<Atraso> atrasados() {
		LocalDate hoje = LocalDate.now();
		List<Atraso> atrasos = new ArrayList<>();
		for (Usuario u : comAluguel()) {
			LocalDate inicio = u.getAluguelDesde() != null ? u.getAluguelDesde() : hoje.withDayOfMonth(1);
			List<LocalDate> pagos = em
					.createQuery("select p.competencia from PagamentoAluguel p where p.colaborador = :u", LocalDate.class)
					.setParameter("u", u)
					.getResultList();
			List<LocalDate> meses = new ArrayList<>();
			for (LocalDate m = inicio.withDayOfMonth(1); !m.isAfter(hoje); m = m.plusMonths(1)) {
				if (!pagos.contains(m) && situacao(false, vencimento(u, m), hoje) == SituacaoAluguel.ATRASADO) {
					meses.add(m);
				}
			}
			if (!meses.isEmpty()) {
				atrasos.add(new Atraso(u.getId(), u.getNome(), meses,
						u.getValorAluguel().multiply(BigDecimal.valueOf(meses.size()))));
			}
		}
		return atrasos;
	}

	/** Aluguéis do mês ainda não pagos (vencidos ou não), mais os atrasados de meses anteriores. */
	@Transactional(readOnly = true)
	public BigDecimal emAberto() {
		LocalDate mesAtual = LocalDate.now().withDayOfMonth(1);
		BigDecimal atrasadosAntes = atrasados().stream()
				.flatMap(a -> a.meses().stream().filter(m -> m.isBefore(mesAtual))
						.map(m -> valorDe(a.colaboradorId())))
				.reduce(BigDecimal.ZERO, BigDecimal::add);
		BigDecimal desteMes = calcularMes(mesAtual).stream()
				.filter(a -> a.situacao() != SituacaoAluguel.PAGO)
				.map(AluguelMes::valor)
				.reduce(BigDecimal.ZERO, BigDecimal::add);
		return atrasadosAntes.add(desteMes);
	}

	/** Aluguéis recebidos no período, pela data do recebimento. */
	@Transactional(readOnly = true)
	public BigDecimal recebidoEntre(LocalDate inicio, LocalDate fim) {
		return em.createQuery("select coalesce(sum(p.valor), 0) from PagamentoAluguel p where p.pagoEm between :i and :f",
				BigDecimal.class)
				.setParameter("i", inicio)
				.setParameter("f", fim)
				.getSingleResult();
	}

	/** Recebe o aluguel inteiro do mês e lança a entrada no caixa. */
	public AluguelMes receber(AluguelDados dados) {
		UsuarioAtual.exigirAdmin();
		Usuario u = dados.colaboradorId() == null ? null : em.find(Usuario.class, dados.colaboradorId());
		if (u == null || !u.isAtivo()) {
			throw RegraException.naoEncontrado("Colaborador");
		}
		if (u.getValorAluguel() == null || u.getValorAluguel().signum() <= 0) {
			throw RegraException.invalido(u.getNome() + " não tem aluguel cadastrado.");
		}
		LocalDate competencia = (dados.mes() != null ? dados.mes() : LocalDate.now()).withDayOfMonth(1);
		Long jaPago = em.createQuery("select count(p) from PagamentoAluguel p where p.colaborador = :u"
				+ " and p.competencia = :m", Long.class)
				.setParameter("u", u)
				.setParameter("m", competencia)
				.getSingleResult();
		if (jaPago > 0) {
			throw new RegraException(HttpStatus.CONFLICT, "O aluguel deste mês já foi recebido.");
		}
		PagamentoAluguel p = new PagamentoAluguel();
		p.setColaborador(u);
		p.setCompetencia(competencia);
		p.setValor(u.getValorAluguel());
		p.setPagoEm(dados.data() != null ? dados.data() : LocalDate.now());
		p.setForma(limitar(dados.forma(), 20));
		p.setObservacao(limitar(dados.observacao(), 200));
		p.setCriadoEm(LocalDateTime.now());
		em.persist(p);
		caixa.registrar(TipoLancamento.ENTRADA, OrigemLancamento.ALUGUEL,
				"Aluguel de " + u.getNome() + " (" + mesPorExtenso(competencia) + ")", p.getValor(), p.getPagoEm(), true,
				p.getId());
		LocalDate vencimento = vencimento(u, competencia);
		return new AluguelMes(u.getId(), u.getNome(), p.getValor(), vencimento, SituacaoAluguel.PAGO, p.getId(),
				p.getPagoEm(), p.getForma());
	}

	/** Desfaz um recebimento lançado por engano, tirando a entrada do caixa. */
	public void desfazer(Long pagamentoId) {
		UsuarioAtual.exigirAdmin();
		PagamentoAluguel p = pagamentoId == null ? null : em.find(PagamentoAluguel.class, pagamentoId);
		if (p == null) {
			throw RegraException.naoEncontrado("Pagamento de aluguel");
		}
		caixa.removerDe(OrigemLancamento.ALUGUEL, p.getId());
		em.remove(p);
	}

	// ---------- Apoio ----------

	private BigDecimal valorDe(Long colaboradorId) {
		return em.find(Usuario.class, colaboradorId).getValorAluguel();
	}

	private List<Usuario> comAluguel() {
		return em.createQuery("select u from Usuario u where u.ativo = true and u.valorAluguel > 0"
				+ " order by lower(u.nome)", Usuario.class).getResultList();
	}

	/** O dia combinado no mês; em meses mais curtos, o último dia. Sem dia combinado, o dia 10. */
	static LocalDate vencimento(Usuario u, LocalDate competencia) {
		int dia = u.getDiaPagamentoAluguel() != null ? u.getDiaPagamentoAluguel() : 10;
		return competencia.withDayOfMonth(Math.min(dia, competencia.lengthOfMonth()));
	}

	static SituacaoAluguel situacao(boolean pago, LocalDate vencimento, LocalDate hoje) {
		if (pago) {
			return SituacaoAluguel.PAGO;
		}
		return hoje.isAfter(vencimento) ? SituacaoAluguel.ATRASADO : SituacaoAluguel.A_VENCER;
	}

	private static final String[] MESES = { "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
			"agosto", "setembro", "outubro", "novembro", "dezembro" };

	private static String mesPorExtenso(LocalDate m) {
		return MESES[m.getMonthValue() - 1] + "/" + m.getYear();
	}

	private static String limitar(String texto, int maximo) {
		String limpo = texto == null ? "" : texto.trim();
		if (limpo.length() > maximo) {
			throw RegraException.invalido("O texto pode ter até " + maximo + " caracteres.");
		}
		return limpo.isEmpty() ? null : limpo;
	}
}
