package com.agenda.tatuagem.estoque;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

/** Alerta de compra pelo limiar. */
class SituacaoTest {

	@Test
	void semLimiarNuncaAvisa() {
		assertEquals(Situacao.OK, EstoqueService.situacao(0, null));
	}

	@Test
	void noLimiarOuAbaixoEstaAbaixo() {
		assertEquals(Situacao.ABAIXO, EstoqueService.situacao(5, 5));
		assertEquals(Situacao.ABAIXO, EstoqueService.situacao(0, 5));
	}

	@Test
	void ateUmQuartoAcimaEstaPerto() {
		assertEquals(Situacao.PROXIMO, EstoqueService.situacao(12, 10));
		assertEquals(Situacao.PROXIMO, EstoqueService.situacao(13, 10));
		assertEquals(Situacao.OK, EstoqueService.situacao(14, 10));
	}

	@Test
	void limiarPequenoTemMargemDeUmaUnidade() {
		assertEquals(Situacao.PROXIMO, EstoqueService.situacao(3, 2));
		assertEquals(Situacao.OK, EstoqueService.situacao(4, 2));
	}
}
