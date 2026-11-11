import { AfterViewInit, Component, ElementRef, OnInit, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { mensagemDeErro } from '../core/agenda';
import { Autenticacao } from '../core/autenticacao';
import { Categoria, Estoque, Item, Movimento, TEXTOS } from '../core/estoque';
import { valorOuTraco } from '../core/formatos';
import { reduzirImagem } from '../core/imagens';

const numero = (texto: string) => {
  const limpo = texto.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  return limpo === '' ? null : Number(limpo);
};

const ROTULOS = { ENTRADA: 'Entrada', BAIXA: 'Baixa', VENDA: 'Venda' };

/** Cadastro e edição de material ou produto, com a imagem e o histórico de movimentos. */
@Component({
  selector: 'app-modal-item',
  templateUrl: './modal-item.html',
  styleUrl: './modal-item.css',
})
export class ModalItem implements OnInit, AfterViewInit {
  protected readonly estoque = inject(Estoque);
  protected readonly autenticacao = inject(Autenticacao);
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  readonly categoria = input.required<Categoria>();
  /** Sem item, cadastra um novo. */
  readonly item = input<Item | null>(null);
  readonly fechar = output<void>();

  protected readonly atual = signal<Item | null>(null);
  protected readonly movimentos = signal<Movimento[]>([]);
  protected readonly erro = signal('');
  protected readonly ocupado = signal(false);
  protected readonly confirmarExclusao = signal(false);
  /** Imagem escolhida no cadastro, enviada depois de criar o item. */
  protected readonly novaImagem = signal<{ arquivo: File; url: string } | null>(null);
  protected readonly textos = computed(() => TEXTOS[this.categoria()]);
  protected readonly produto = computed(() => this.categoria() === 'PRODUTO');
  protected readonly valorOuTraco = valorOuTraco;
  protected readonly rotulos = ROTULOS;

  ngOnInit() {
    this.atual.set(this.item());
    void this.carregarMovimentos();
  }

  ngAfterViewInit() {
    this.dialogo().nativeElement.showModal();
  }

  private async carregarMovimentos() {
    const item = this.atual();
    if (!item) return;
    try {
      this.movimentos.set(await this.estoque.movimentos(item.id));
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }

  protected escolherImagem(evento: Event) {
    const arquivo = (evento.target as HTMLInputElement).files?.[0];
    (evento.target as HTMLInputElement).value = '';
    if (!arquivo) return;
    const item = this.atual();
    if (item) {
      void this.fazer(async () => {
        const { blob, nome } = await reduzirImagem(arquivo);
        this.atual.set(await this.estoque.trocarImagem(item.id, blob, nome));
      });
    } else {
      const anterior = this.novaImagem();
      if (anterior) URL.revokeObjectURL(anterior.url);
      this.novaImagem.set({ arquivo, url: URL.createObjectURL(arquivo) });
    }
  }

  protected async enviar(evento: Event) {
    evento.preventDefault();
    const campos = new FormData(evento.target as HTMLFormElement);
    const texto = (nome: string) => String(campos.get(nome) ?? '').trim();
    const dados = {
      categoria: this.categoria(),
      nome: texto('nome'),
      unidade: texto('unidade'),
      quantidade: numero(texto('quantidade')),
      limiar: numero(texto('limiar')),
      precoVenda: numero(texto('precoVenda')),
      observacao: texto('observacao'),
    };
    const item = this.atual();
    if (!item && this.categoria() === 'INSUMO' && !this.novaImagem()) {
      this.erro.set('Escolha uma imagem do material, para ele ser reconhecido na lista.');
      return;
    }
    const ok = await this.fazer(async () => {
      if (item) {
        this.atual.set(await this.estoque.alterar(item.id, dados));
        return;
      }
      const criado = await this.estoque.criar(dados);
      const imagem = this.novaImagem();
      if (imagem) {
        const { blob, nome } = await reduzirImagem(imagem.arquivo);
        await this.estoque.trocarImagem(criado.id, blob, nome);
      }
    });
    if (ok) this.dialogo().nativeElement.close();
  }

  protected estornar(m: Movimento) {
    return this.fazer(async () => {
      this.atual.set(await this.estoque.estornar(m.id));
      await this.carregarMovimentos();
    });
  }

  protected async excluir() {
    const item = this.atual();
    if (!item) return;
    const ok = await this.fazer(() => this.estoque.excluir(item.id));
    if (ok) this.dialogo().nativeElement.close();
  }

  protected quando(m: Movimento) {
    return new Date(m.data).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  protected fecharPeloFundo(evento: MouseEvent) {
    if (evento.target === this.dialogo().nativeElement) this.dialogo().nativeElement.close();
  }

  protected aoFechar() {
    const imagem = this.novaImagem();
    if (imagem) URL.revokeObjectURL(imagem.url);
    this.fechar.emit();
  }

  private async fazer(acao: () => Promise<unknown>): Promise<boolean> {
    this.ocupado.set(true);
    this.erro.set('');
    try {
      await acao();
      return true;
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
      return false;
    } finally {
      this.ocupado.set(false);
    }
  }
}
