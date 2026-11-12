package com.agenda.tatuagem.painel;

import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.agenda.tatuagem.painel.PainelDTOs.Painel;

@RestController
public class PainelController {

	private final PainelService painel;

	PainelController(PainelService painel) {
		this.painel = painel;
	}

	/** Todos podem ver; os valores em dinheiro só vêm para administradores. */
	@GetMapping("painel")
	public Painel painel(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate inicio,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fim) {
		return painel.painel(inicio, fim);
	}
}
