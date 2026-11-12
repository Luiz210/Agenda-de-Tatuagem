package com.agenda.tatuagem.painel;

import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.agenda.tatuagem.agenda.AgendaDTOs.Pendencias;
import com.agenda.tatuagem.agenda.AgendaService;
import com.agenda.tatuagem.estoque.Categoria;
import com.agenda.tatuagem.estoque.EstoqueService;

/** Os números dos avisos do menu lateral. Todos podem ver: não há valores aqui. */
@RestController
public class PendenciasController {

	private final AgendaService agenda;
	private final EstoqueService estoque;

	PendenciasController(AgendaService agenda, EstoqueService estoque) {
		this.agenda = agenda;
		this.estoque = estoque;
	}

	@GetMapping("pendencias")
	@Transactional(readOnly = true)
	public Pendencias pendencias() {
		return new Pendencias(agenda.sessoesSemConfirmacao(), agenda.clientesParaContatar(),
				estoque.paraComprar(Categoria.INSUMO), estoque.paraComprar(Categoria.PRODUTO));
	}
}
