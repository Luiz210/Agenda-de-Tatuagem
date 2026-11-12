package com.agenda.tatuagem.financeiro;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.agenda.tatuagem.autenticacao.Usuario;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.SituacaoAluguel;
import com.agenda.tatuagem.financeiro.FinanceiroDTOs.SituacaoConta;

/** Parcelas de compras, vencimento de contas e atraso de aluguel. */
class RegrasFinanceirasTest {

	@Test
	void parcelasSomamOTotalEAUltimaFicaComOsCentavos() {
		List<BigDecimal> parcelas = ContasService.dividir(new BigDecimal("100.00"), 3);
		assertEquals(List.of(new BigDecimal("33.33"), new BigDecimal("33.33"), new BigDecimal("33.34")), parcelas);
	}

	@Test
	void parcelaUnicaEOTotal() {
		assertEquals(List.of(new BigDecimal("259.90")), ContasService.dividir(new BigDecimal("259.90"), 1));
	}

	@Test
	void contaVencidaSoDepoisDoDiaDoVencimento() {
		LocalDate hoje = LocalDate.of(2026, 11, 11);
		ContaPagar conta = new ContaPagar();
		conta.setVencimento(hoje);
		assertEquals(SituacaoConta.ABERTA, ContasService.situacao(conta, hoje));
		conta.setVencimento(hoje.minusDays(1));
		assertEquals(SituacaoConta.VENCIDA, ContasService.situacao(conta, hoje));
		conta.setPagaEm(hoje);
		assertEquals(SituacaoConta.PAGA, ContasService.situacao(conta, hoje));
	}

	@Test
	void aluguelVenceNoDiaCombinadoOuNoUltimoDiaDoMes() {
		Usuario u = new Usuario();
		u.setDiaPagamentoAluguel(31);
		assertEquals(LocalDate.of(2026, 2, 28), AlugueisService.vencimento(u, LocalDate.of(2026, 2, 1)));
		u.setDiaPagamentoAluguel(5);
		assertEquals(LocalDate.of(2026, 11, 5), AlugueisService.vencimento(u, LocalDate.of(2026, 11, 1)));
	}

	@Test
	void aluguelAtrasaNoDiaSeguinteAoVencimento() {
		LocalDate vencimento = LocalDate.of(2026, 11, 10);
		assertEquals(SituacaoAluguel.A_VENCER, AlugueisService.situacao(false, vencimento, vencimento));
		assertEquals(SituacaoAluguel.ATRASADO, AlugueisService.situacao(false, vencimento, vencimento.plusDays(1)));
		assertEquals(SituacaoAluguel.PAGO, AlugueisService.situacao(true, vencimento, vencimento.plusDays(30)));
	}
}
