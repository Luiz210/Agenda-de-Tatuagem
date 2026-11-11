package com.agenda.tatuagem.autenticacao;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.Colaborador;
import com.agenda.tatuagem.autenticacao.AutenticacaoDTOs.ColaboradorDados;

@RestController
@RequestMapping("colaboradores")
public class ColaboradoresController {

	private final ColaboradoresService colaboradores;

	ColaboradoresController(ColaboradoresService colaboradores) {
		this.colaboradores = colaboradores;
	}

	@GetMapping
	public List<Colaborador> listar() {
		return colaboradores.listar();
	}

	@PostMapping
	public Colaborador criar(@RequestBody ColaboradorDados dados) {
		return colaboradores.criar(dados);
	}

	@PutMapping("{id}")
	public Colaborador alterar(@PathVariable Long id, @RequestBody ColaboradorDados dados) {
		return colaboradores.alterar(id, dados);
	}

	@DeleteMapping("{id}")
	public ResponseEntity<Void> excluir(@PathVariable Long id) {
		colaboradores.excluir(id);
		return ResponseEntity.noContent().build();
	}
}
