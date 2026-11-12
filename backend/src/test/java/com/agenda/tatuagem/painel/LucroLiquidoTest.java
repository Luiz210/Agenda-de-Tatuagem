package com.agenda.tatuagem.painel;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

/** Fórmula combinada na reunião: (aluguéis + vendas) − (contas + compras). */
class LucroLiquidoTest {

	@Test
	void entradasMenosSaidas() {
		assertEquals(new BigDecimal("1050.50"), PainelService.lucroLiquido(new BigDecimal("2500.00"),
				new BigDecimal("350.50"), new BigDecimal("1200.00"), new BigDecimal("600.00")));
	}

	@Test
	void prejuizoFicaNegativo() {
		assertEquals(new BigDecimal("-400.00"), PainelService.lucroLiquido(new BigDecimal("800.00"), BigDecimal.ZERO,
				new BigDecimal("1200.00"), BigDecimal.ZERO));
	}
}
