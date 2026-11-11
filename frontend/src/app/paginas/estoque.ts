import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Agenda, mensagemDeErro } from '../core/agenda';
import { Autenticacao } from '../core/autenticacao';
import { Categoria, Estoque, Item, TEXTOS, TipoMovimento } from '../core/estoque';
import { valorOuTraco } from '../core/formatos';
import { ModalItem } from '../componentes/modal-item';
import { ModalMovimento } from '../componentes/modal-movimento';

const semAcento = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Ordem da lista em "Para comprar": primeiro o que já passou do limiar. */
const PESO = { ABAIXO: 0, PROXIMO: 1, OK: 2 };

/**
 * Estoque de materiais e produtos à venda: a mesma tela, conforme a categoria da
 * rota. Todos veem e movimentam; o faturamento só aparece para administradores.
 */
@Component({
  selector: 'app-pagina-estoque',
  imports: [ModalItem, ModalMovimento],
  templateUrl: './estoque.html',
  styleUrl: './estoque.css',
})
export class PaginaEstoque {
  protected readonly estoque = inject(Estoque);
  private readonly agenda = inject(Agenda);
  private readonly autenticacao = inject(Autenticacao);

  /** Vem dos dados da rota. */
  readonly categoria = input.required<Categoria>();

  protected readonly itens = signal<Item[]>([]);
  protected readonly erro = signal('');
  protected readonly busca = signal('');
  protected readonly soParaComprar = signal(false);
  protected readonly editando = signal<Item | 'novo' | null>(null);
  protected readonly movimentando = signal<{ item: Item; tipo: TipoMovimento } | null>(null);
  protected readonly textos = computed(() => TEXTOS[this.categoria()]);
  protected readonly produto = computed(() => this.categoria() === 'PRODUTO');
  protected readonly valorOuTraco = valorOuTraco;

  protected readonly paraComprar = computed(() => this.itens().filter((i) => i.situacao !== 'OK'));
  protected readonly filtrados = computed(() => {
    const termo = semAcento(this.busca().trim());
    const base = this.soParaComprar()
      ? [...this.paraComprar()].sort((a, b) => PESO[a.situacao] - PESO[b.situacao])
      : this.itens();
    return termo ? base.filter((i) => semAcento(i.nome).includes(termo)) : base;
  });

  constructor() {
    effect(() => {
      this.agenda.versao();
      // O faturamento depende de quem está identificado.
      this.autenticacao.conta();
      void this.carregar(this.categoria());
    });
  }

  private async carregar(categoria: Categoria) {
    try {
      this.itens.set(await this.estoque.listar(categoria));
      this.erro.set('');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }

  protected movimentar(item: Item, tipo: TipoMovimento) {
    this.movimentando.set({ item, tipo });
  }
}
