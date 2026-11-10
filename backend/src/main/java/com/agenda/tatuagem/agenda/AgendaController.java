package com.agenda.tatuagem.agenda;

import java.io.IOException;
import java.time.LocalDate;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
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

import com.agenda.tatuagem.agenda.AgendaDTOs.ClienteDados;
import com.agenda.tatuagem.agenda.AgendaDTOs.ClienteResumo;
import com.agenda.tatuagem.agenda.AgendaDTOs.Ficha;
import com.agenda.tatuagem.agenda.AgendaDTOs.ImagemDetalhe;
import com.agenda.tatuagem.agenda.AgendaDTOs.PagamentoDados;
import com.agenda.tatuagem.agenda.AgendaDTOs.PagamentoDetalhe;
import com.agenda.tatuagem.agenda.AgendaDTOs.SessaoAgenda;
import com.agenda.tatuagem.agenda.AgendaDTOs.SessaoDados;
import com.agenda.tatuagem.agenda.AgendaDTOs.SessaoDetalhe;
import com.agenda.tatuagem.agenda.AgendaDTOs.TatuagemDados;
import com.agenda.tatuagem.agenda.AgendaDTOs.TatuagemDetalhe;

@RestController
public class AgendaController {

	private final AgendaService agenda;

	AgendaController(AgendaService agenda) {
		this.agenda = agenda;
	}

	@GetMapping("clientes")
	public List<ClienteResumo> clientes() {
		return agenda.clientes();
	}

	@GetMapping("clientes/{id}")
	public Ficha ficha(@PathVariable Long id) {
		return agenda.ficha(id);
	}

	@PostMapping("clientes")
	public ClienteResumo criarCliente(@RequestBody ClienteDados dados) {
		return agenda.criarCliente(dados);
	}

	@PutMapping("clientes/{id}")
	public ResponseEntity<Void> alterarCliente(@PathVariable Long id, @RequestBody ClienteDados dados) {
		agenda.alterarCliente(id, dados);
		return ResponseEntity.noContent().build();
	}

	@DeleteMapping("clientes/{id}")
	public ResponseEntity<Void> removerCliente(@PathVariable Long id) {
		agenda.removerCliente(id);
		return ResponseEntity.noContent().build();
	}

	@GetMapping("tatuagens/{id}")
	public TatuagemDetalhe tatuagem(@PathVariable Long id) {
		return agenda.tatuagem(id);
	}

	@PostMapping("tatuagens")
	public TatuagemDetalhe criarTatuagem(@RequestBody TatuagemDados dados) {
		return agenda.criarTatuagem(dados);
	}

	@PutMapping("tatuagens/{id}")
	public ResponseEntity<Void> alterarTatuagem(@PathVariable Long id, @RequestBody TatuagemDados dados) {
		agenda.alterarTatuagem(id, dados);
		return ResponseEntity.noContent().build();
	}

	@DeleteMapping("tatuagens/{id}")
	public ResponseEntity<Void> removerTatuagem(@PathVariable Long id) {
		agenda.removerTatuagem(id);
		return ResponseEntity.noContent().build();
	}

	@GetMapping("sessoes")
	public List<SessaoAgenda> sessoes(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate inicio,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fim) {
		return agenda.sessoes(inicio, fim);
	}

	@GetMapping("sessoes/proximas")
	public List<SessaoAgenda> proximas(
			@RequestParam("a-partir-de") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate aPartirDe,
			@RequestParam(defaultValue = "5") int limite) {
		return agenda.proximas(aPartirDe, limite);
	}

	@PostMapping("sessoes")
	public SessaoDetalhe criarSessao(@RequestBody SessaoDados dados) {
		return agenda.criarSessao(dados);
	}

	@PutMapping("sessoes/{id}")
	public SessaoDetalhe alterarSessao(@PathVariable Long id, @RequestBody SessaoDados dados) {
		return agenda.alterarSessao(id, dados);
	}

	@DeleteMapping("sessoes/{id}")
	public ResponseEntity<Void> removerSessao(@PathVariable Long id) {
		agenda.removerSessao(id);
		return ResponseEntity.noContent().build();
	}

	@PostMapping("pagamentos")
	public PagamentoDetalhe criarPagamento(@RequestBody PagamentoDados dados) {
		return agenda.criarPagamento(dados);
	}

	@DeleteMapping("pagamentos/{id}")
	public ResponseEntity<Void> removerPagamento(@PathVariable Long id) {
		agenda.removerPagamento(id);
		return ResponseEntity.noContent().build();
	}

	@PostMapping("tatuagens/{id}/imagens")
	public ImagemDetalhe adicionarImagem(@PathVariable Long id, @RequestParam("arquivo") MultipartFile arquivo)
			throws IOException {
		return agenda.adicionarImagem(id, arquivo.getOriginalFilename(), arquivo.getContentType(), arquivo.getBytes());
	}

	@GetMapping("imagens/{id}")
	public ResponseEntity<byte[]> imagem(@PathVariable Long id) {
		Imagem imagem = agenda.imagem(id);
		return ResponseEntity.ok()
				.contentType(MediaType.parseMediaType(imagem.getTipo()))
				.cacheControl(CacheControl.noCache().cachePrivate())
				.body(imagem.getConteudo());
	}

	@DeleteMapping("imagens/{id}")
	public ResponseEntity<Void> removerImagem(@PathVariable Long id) {
		agenda.removerImagem(id);
		return ResponseEntity.noContent().build();
	}
}
