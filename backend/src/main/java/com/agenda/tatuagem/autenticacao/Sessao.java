package com.agenda.tatuagem.autenticacao;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Só o hash do token fica no banco; ele vale até a pessoa clicar em Sair. */
@Entity
@Table(name = "SESSAO")
@Data
@NoArgsConstructor
public class Sessao {

	@Id
	@Column(name = "TOKEN_HASH", length = 64)
	private String tokenHash;

	@Column(name = "USUARIO_ID", nullable = false)
	private Long usuarioId;

	@Column(name = "CRIADA_EM", nullable = false)
	private LocalDateTime criadaEm;
}
