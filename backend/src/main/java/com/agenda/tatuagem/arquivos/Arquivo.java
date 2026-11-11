package com.agenda.tatuagem.arquivos;

import java.time.LocalDateTime;

import jakarta.persistence.Basic;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/**
 * Imagem ou documento guardado no banco: foto de material e de produto e, no
 * financeiro, fotos de contas e comprovantes. Fica numa tabela própria para as
 * listas não carregarem o conteúdo junto.
 */
@Entity
@Table(name = "ARQUIVO")
@Getter
@Setter
public class Arquivo {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, length = 150)
	private String nome;

	@Column(nullable = false, length = 80)
	private String tipo;

	@Lob
	@Basic(fetch = FetchType.LAZY)
	@Column(nullable = false)
	private byte[] conteudo;

	@Column(nullable = false)
	private LocalDateTime criadoEm;
}
