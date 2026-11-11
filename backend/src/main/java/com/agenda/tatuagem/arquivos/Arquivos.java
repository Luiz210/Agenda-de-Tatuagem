package com.agenda.tatuagem.arquivos;

import java.time.LocalDateTime;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.agenda.tatuagem.agenda.RegraException;

import jakarta.persistence.EntityManager;

/** Guarda e lê arquivos. Quem usa (estoque, financeiro) decide a quem eles pertencem. */
@Service
@Transactional
public class Arquivos {

	/** Imagens e PDF (comprovantes costumam vir em PDF). */
	private static final Set<String> TIPOS_ACEITOS = Set.of("application/pdf");

	private final EntityManager em;

	Arquivos(EntityManager em) {
		this.em = em;
	}

	public Arquivo salvar(String nome, String tipo, byte[] conteudo, boolean aceitaPdf) {
		boolean imagem = tipo != null && tipo.startsWith("image/");
		boolean pdf = aceitaPdf && tipo != null && TIPOS_ACEITOS.contains(tipo);
		if (!imagem && !pdf) {
			throw RegraException.invalido(aceitaPdf ? "Envie uma imagem (JPG, PNG) ou um PDF."
					: "Envie uma imagem (JPG, PNG ou WEBP).");
		}
		if (conteudo == null || conteudo.length == 0) {
			throw RegraException.invalido("O arquivo está vazio.");
		}
		Arquivo a = new Arquivo();
		a.setNome(nome == null || nome.isBlank() ? "arquivo" : nome.substring(0, Math.min(nome.length(), 150)));
		a.setTipo(tipo.length() > 80 ? "application/octet-stream" : tipo);
		a.setConteudo(conteudo);
		a.setCriadoEm(LocalDateTime.now());
		em.persist(a);
		return a;
	}

	@Transactional(readOnly = true)
	public Arquivo ler(Long id) {
		Arquivo a = id == null ? null : em.find(Arquivo.class, id);
		if (a == null) {
			throw new RegraException(HttpStatus.NOT_FOUND, "Arquivo não encontrado.");
		}
		a.getConteudo();
		return a;
	}

	public void remover(Arquivo a) {
		if (a != null) {
			em.remove(em.contains(a) ? a : em.merge(a));
		}
	}
}
