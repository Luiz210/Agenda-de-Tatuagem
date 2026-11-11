package com.agenda.tatuagem.auditoria;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/**
 * Uma alteração feita nos dados: quem fez, quando, onde e o que mudou. Os
 * registros são gravados direto pelo {@link OuvinteDeAlteracoes} e nunca são
 * alterados nem apagados pela aplicação.
 */
@Entity
@Table(name = "AUDITORIA", indexes = { @Index(name = "IX_AUDITORIA_REGISTRO", columnList = "ENTIDADE, REGISTRO_ID"),
		@Index(name = "IX_AUDITORIA_DATA", columnList = "DATA_HORA") })
@Getter
@Setter
public class Auditoria {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "DATA_HORA", nullable = false)
	private LocalDateTime dataHora;

	/** 0 quando a alteração não tinha ninguém identificado (não deveria acontecer). */
	@Column(name = "USUARIO_ID", nullable = false)
	private Long usuarioId;

	/** O nome no momento da alteração, para continuar legível mesmo que a pessoa mude de nome. */
	@Column(name = "USUARIO_NOME", length = 100)
	private String usuarioNome;

	/** ESTUDIO (pelo código, no computador do estúdio) ou REMOTO (login em outro computador). */
	@Column(name = "ORIGEM", nullable = false, length = 10)
	private String origem;

	/** INCLUSAO, ALTERACAO ou EXCLUSAO. */
	@Column(name = "ACAO", nullable = false, length = 10)
	private String acao;

	/** Nome da classe: Cliente, Tatuagem, SessaoTatuagem, Pagamento... */
	@Column(name = "ENTIDADE", nullable = false, length = 40)
	private String entidade;

	@Column(name = "REGISTRO_ID")
	private Long registroId;

	@Column(name = "DETALHES", length = 4000)
	private String detalhes;
}
