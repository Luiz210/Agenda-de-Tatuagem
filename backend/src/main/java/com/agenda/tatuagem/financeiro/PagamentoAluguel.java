package com.agenda.tatuagem.financeiro;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

import com.agenda.tatuagem.autenticacao.Usuario;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.Setter;

/** O aluguel de um colaborador num mês. É pago de uma vez: não existe pagamento parcial. */
@Entity
@Table(name = "PAGAMENTO_ALUGUEL", uniqueConstraints = @UniqueConstraint(name = "UK_ALUGUEL_MES",
		columnNames = { "COLABORADOR_ID", "COMPETENCIA" }))
@Getter
@Setter
public class PagamentoAluguel {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "COLABORADOR_ID", nullable = false)
	private Usuario colaborador;

	/** Primeiro dia do mês a que o aluguel se refere. */
	@Column(name = "COMPETENCIA", nullable = false)
	private LocalDate competencia;

	@Column(nullable = false, precision = 10, scale = 2)
	private BigDecimal valor;

	@Column(nullable = false)
	private LocalDate pagoEm;

	@Column(length = 20)
	private String forma;

	@Column(length = 200)
	private String observacao;

	@Column(nullable = false)
	private LocalDateTime criadoEm;
}
