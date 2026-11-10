package com.agenda.tatuagem.autenticacao;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "USUARIO")
@SequenceGenerator(name = "TAB_USUARIO_SEQ", sequenceName = "TAB_USUARIO_SEQ", allocationSize = 1)
@Data
@NoArgsConstructor
public class Usuario {

	@Id
	@Column(name = "ID")
	@GeneratedValue(strategy = GenerationType.AUTO, generator = "TAB_USUARIO_SEQ")
	private Long id;

	@Column(name = "NOME", length = 100, nullable = false)
	private String nome;

	@Column(name = "NOME_USUARIO", length = 50, nullable = false, unique = true)
	private String nomeUsuario;

	@Column(name = "EMAIL", length = 150, nullable = false, unique = true)
	private String email;

	@Column(name = "SENHA_HASH", length = 200, nullable = false)
	private String senhaHash;
}
