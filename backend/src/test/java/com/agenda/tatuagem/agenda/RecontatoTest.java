package com.agenda.tatuagem.agenda;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDate;
import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;

/** Regra do destaque de clientes que sumiram. */
class RecontatoTest {

	private static final LocalDate HOJE = LocalDate.of(2026, 11, 11);

	@Test
	void quemNuncaTatuouNaoEntra() {
		assertFalse(AgendaService.paraContatar(null, null, HOJE));
	}

	@Test
	void ultimaTatuagemRecenteNaoEntra() {
		assertFalse(AgendaService.paraContatar(HOJE.minusMonths(5), null, HOJE));
	}

	@Test
	void seisMesesSemTatuarEntra() {
		assertTrue(AgendaService.paraContatar(HOJE.minusMonths(6), null, HOJE));
		assertTrue(AgendaService.paraContatar(HOJE.minusYears(2), null, HOJE));
	}

	@Test
	void contatadoHaMenosDeSeisMesesSaiDoDestaque() {
		assertFalse(AgendaService.paraContatar(HOJE.minusYears(1), HOJE.minusMonths(2).atTime(10, 0), HOJE));
	}

	@Test
	void seisMesesDepoisDoContatoVoltaAoDestaque() {
		LocalDateTime contato = HOJE.minusMonths(6).atTime(10, 0);
		assertTrue(AgendaService.paraContatar(HOJE.minusYears(1), contato, HOJE));
	}

	@Test
	void horarioMarcadoNoFuturoNaoEntra() {
		assertFalse(AgendaService.paraContatar(HOJE.plusDays(10), null, HOJE));
	}
}
