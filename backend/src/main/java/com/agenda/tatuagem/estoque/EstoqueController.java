package com.agenda.tatuagem.estoque;

import java.io.IOException;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.agenda.tatuagem.estoque.EstoqueDTOs.ItemDados;
import com.agenda.tatuagem.estoque.EstoqueDTOs.ItemResumo;
import com.agenda.tatuagem.estoque.EstoqueDTOs.MovimentoDados;
import com.agenda.tatuagem.estoque.EstoqueDTOs.MovimentoDetalhe;

@RestController
public class EstoqueController {

	private final EstoqueService estoque;

	EstoqueController(EstoqueService estoque) {
		this.estoque = estoque;
	}

	@GetMapping("estoque")
	public List<ItemResumo> listar(@RequestParam(required = false) Categoria categoria) {
		return estoque.listar(categoria);
	}

	@GetMapping("estoque/{id}")
	public ItemResumo item(@PathVariable Long id) {
		return estoque.item(id);
	}

	@PostMapping("estoque")
	public ItemResumo criar(@RequestBody ItemDados dados) {
		return estoque.criar(dados);
	}

	@PutMapping("estoque/{id}")
	public ItemResumo alterar(@PathVariable Long id, @RequestBody ItemDados dados) {
		return estoque.alterar(id, dados);
	}

	@DeleteMapping("estoque/{id}")
	public ResponseEntity<Void> excluir(@PathVariable Long id) {
		estoque.excluir(id);
		return ResponseEntity.noContent().build();
	}

	@PutMapping("estoque/{id}/imagem")
	public ItemResumo trocarImagem(@PathVariable Long id, @RequestParam("arquivo") MultipartFile arquivo)
			throws IOException {
		return estoque.trocarImagem(id, arquivo.getOriginalFilename(), arquivo.getContentType(), arquivo.getBytes());
	}

	@DeleteMapping("estoque/{id}/imagem")
	public ResponseEntity<Void> removerImagem(@PathVariable Long id) {
		estoque.removerImagem(id);
		return ResponseEntity.noContent().build();
	}

	@GetMapping("estoque/{id}/movimentos")
	public List<MovimentoDetalhe> movimentos(@PathVariable Long id) {
		return estoque.movimentos(id);
	}

	@PostMapping("estoque/{id}/movimentos")
	public ItemResumo movimentar(@PathVariable Long id, @RequestBody MovimentoDados dados) {
		return estoque.movimentar(id, dados);
	}

	@DeleteMapping("movimentos/{id}")
	public ItemResumo estornar(@PathVariable Long id) {
		return estoque.estornar(id);
	}
}
