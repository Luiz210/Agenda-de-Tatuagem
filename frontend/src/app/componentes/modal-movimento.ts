import { AfterViewInit, Component, OnInit, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { mensagemDeErro } from '../core/agenda';
import { Estoque, Item, TipoMovimento } from '../core/estoque';
import { valorOuTraco } from '../core/formatos';
import { FORMAS_DE_PAGAMENTO } from './modal-tatuagem';

const numero = (texto: string) => {
  const limpo = texto.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  return limpo === '' ? null : Number(limpo);
};

const TITULOS: Record<TipoMovimento, string> = { ENTRADA: 'Repor', BAIXA: 'Dar baixa', VENDA: 'Vender' };

/** Repor, dar baixa ou vender um item. */
@Component({
  selector: 'app-modal-movimento',
  templateUrl: './modal-movimento.html',
  styles: ':host { --largura-modal: 26rem; } .total { margin: 0; } .total strong { font-size: 1.15rem; }',
})
export class ModalMovimento implements OnInit, AfterViewInit {
  private readonly estoque = inject(Estoque);
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  readonly item = input.required<Item>();
  readonly tipo = input.required<TipoMovimento>();
  readonly fechar = output<void>();

  protected readonly erro = signal('');
  protected readonly ocupado = signal(false);
  protected readonly quantidade = signal('1');
  protected readonly preco = signal('');
  protected readonly formas = FORMAS_DE_PAGAMENTO;
  protected readonly valorOuTraco = valorOuTraco;
  protected readonly titulo = computed(() => TITULOS[this.tipo()]);
  protected readonly total = computed(() => {
    const q = numero(this.quantidade()) ?? 0;
    const p = numero(this.preco()) ?? this.item().precoVenda ?? 0;
    return q * p;
  });
  protected readonly unidade = computed(() => this.item().unidade || 'un.');

  ngOnInit() {
    if (this.item().precoVenda != null) this.preco.set(String(this.item().precoVenda).replace('.', ','));
  }

  ngAfterViewInit() {
    this.dialogo().nativeElement.showModal();
  }

  protected async enviar(evento: Event) {
    evento.preventDefault();
    const campos = new FormData(evento.target as HTMLFormElement);
    const texto = (nome: string) => String(campos.get(nome) ?? '').trim();
    this.ocupado.set(true);
    this.erro.set('');
    try {
      await this.estoque.movimentar(this.item().id, {
        tipo: this.tipo(),
        quantidade: numero(this.quantidade()) ?? 0,
        valorUnitario: this.tipo() === 'VENDA' ? numero(this.preco()) : null,
        forma: texto('forma'),
        observacao: texto('observacao'),
      });
      this.dialogo().nativeElement.close();
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected fecharPeloFundo(evento: MouseEvent) {
    if (evento.target === this.dialogo().nativeElement) this.dialogo().nativeElement.close();
  }
}
