package com.agenda.tatuagem.arquivos;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ArquivosController {

	private final Arquivos arquivos;

	ArquivosController(Arquivos arquivos) {
		this.arquivos = arquivos;
	}

	/** Abre na própria tela (imagem ou PDF), com o nome original se a pessoa salvar. */
	@GetMapping("arquivos/{id}")
	public ResponseEntity<byte[]> ler(@PathVariable Long id) {
		Arquivo a = arquivos.ler(id);
		return ResponseEntity.ok()
				.contentType(MediaType.parseMediaType(a.getTipo()))
				.header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + a.getNome().replace("\"", "") + "\"")
				.cacheControl(CacheControl.noCache().cachePrivate())
				.body(a.getConteudo());
	}
}
