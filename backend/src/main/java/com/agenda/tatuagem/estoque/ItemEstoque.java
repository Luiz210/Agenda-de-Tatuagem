package com.agenda.tatuagem.estoque;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import org.hibernate.annotations.ColumnDefault;

import com.agenda.tatuagem.arquivos.Arquivo;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/**
 * Um material do estúdio ou um produto à venda. A quantidade só muda por
 * movimentos (entrada, baixa, venda), para ficar sempre explicada.
 */
@Entity
@Table(name = "ITEM_ESTOQUE")
@Getter
@Setter
public class ItemEstoque {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 10)
	private Categoria categoria;

	@Column(nullable = false, length = 120)
	private String nome;

	/** Como é contado: unidade, caixa, frasco, pacote... */
	@Column(length = 20)
	private String unidade;

	@ColumnDefault("0")
	@Column(nullable = false)
	private int quantidade;

	/** Quando a quantidade chega aqui, é hora de comprar. Obrigatório nos insumos. */
	private Integer limiar;

	/** Só para produtos. */
	@Column(precision = 10, scale = 2)
	private BigDecimal precoVenda;

	@Column(length = 500)
	private String observacao;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "IMAGEM_ID")
	private Arquivo imagem;

	/** Excluir só esconde o item, para as vendas antigas continuarem nos relatórios. */
	@ColumnDefault("true")
	@Column(nullable = false)
	private boolean ativo = true;

	@Column(nullable = false)
	private LocalDateTime criadoEm;
}
