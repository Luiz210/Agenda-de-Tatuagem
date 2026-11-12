package com.agenda.tatuagem.autenticacao;

import java.math.BigDecimal;
import java.time.LocalDate;

import org.hibernate.annotations.ColumnDefault;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Uma pessoa do estúdio: tem login para usar de casa e um código (PIN) para o computador do estúdio. */
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

	/** Opcional para quem é cadastrado pelo administrador. */
	@Column(name = "EMAIL", length = 150, unique = true)
	private String email;

	@Column(name = "SENHA_HASH", length = 200, nullable = false)
	private String senhaHash;

	@Enumerated(EnumType.STRING)
	@ColumnDefault("'PADRAO'")
	@Column(name = "PERFIL", length = 20, nullable = false)
	private Perfil perfil = Perfil.PADRAO;

	/** Excluir um colaborador só o desativa, para o histórico continuar mostrando o nome. */
	@ColumnDefault("true")
	@Column(name = "ATIVO", nullable = false)
	private boolean ativo = true;

	@Column(name = "FUNCAO", length = 60)
	private String funcao;

	@Column(name = "TELEFONE", length = 20)
	private String telefone;

	@Column(name = "VALOR_ALUGUEL", precision = 10, scale = 2)
	private BigDecimal valorAluguel;

	/** Dia do mês em que o aluguel vence. */
	@Column(name = "DIA_PAGAMENTO_ALUGUEL")
	private Integer diaPagamentoAluguel;

	/** Primeiro mês em que o aluguel é cobrado. Antes dele não há atraso. */
	@Column(name = "ALUGUEL_DESDE")
	private LocalDate aluguelDesde;

	@Column(name = "PIN_HASH", length = 200)
	private String pinHash;

	public boolean isAdmin() {
		return perfil == Perfil.ADMIN;
	}
}
