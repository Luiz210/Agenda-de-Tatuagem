package com.agenda.tatuagem.estoque;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import com.agenda.tatuagem.autenticacao.Usuario;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** Uma entrada, baixa ou venda. As vendas alimentam o ranking e o faturamento com produtos. */
@Entity
@Table(name = "MOVIMENTO_ESTOQUE", indexes = @Index(name = "IX_MOVIMENTO_ITEM", columnList = "ITEM_ID"))
@Getter
@Setter
public class Movimento {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "ITEM_ID", nullable = false)
	private ItemEstoque item;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 10)
	private TipoMovimento tipo;

	@Column(nullable = false)
	private int quantidade;

	/** Na venda: preço de cada unidade. */
	@Column(precision = 10, scale = 2)
	private BigDecimal valorUnitario;

	/** Na venda: quantidade vezes o preço. */
	@Column(precision = 12, scale = 2)
	private BigDecimal valorTotal;

	@Column(length = 20)
	private String forma;

	@Column(nullable = false)
	private LocalDateTime data;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "USUARIO_ID")
	private Usuario usuario;

	@Column(length = 200)
	private String observacao;
}
