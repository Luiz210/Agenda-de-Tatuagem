import { AfterViewInit, Component, ElementRef, OnInit, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { mensagemDeErro } from '../core/agenda';
import { dataCurta, hojeIso } from '../core/datas';
import { Baixa, Conta, Financeiro } from '../core/financeiro';
import { valorOuTraco } from '../core/formatos';
import { reduzirImagem } from '../core/imagens';
import { ModalBaixa } from './modal-baixa';
import { VisualizadorArquivo } from './visualizador-arquivo';

const numero = (texto: string) => {
  const limpo = texto.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  return limpo === '' ? null : Number(limpo);
};

/** Fotos viram JPG menores; PDFs vão como estão. */
async function prepararArquivo(arquivo: File): Promise<{ blob: Blob; nome: string }> {
  return arquivo.type.startsWith('image/') ? reduzirImagem(arquivo) : { blob: arquivo, nome: arquivo.name };
}

/** Cadastro, edição e pagamento de uma conta. */
@Component({
  selector: 'app-modal-conta',
  imports: [ModalBaixa, VisualizadorArquivo],
  templateUrl: './modal-conta.html',
  styleUrl: './modal-financeiro.css',
})
export class ModalConta implements OnInit, AfterViewInit {
  protected readonly financeiro = inject(Financeiro);
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  /** Sem conta, cadastra uma nova. */
  readonly conta = input<Conta | null>(null);
  readonly fechar = output<void>();
  /** A conta é parcela: abre a compra no lugar desta janela. */
  readonly abrirCompra = output<number>();

  protected readonly atual = signal<Conta | null>(null);
  protected readonly erro = signal('');
  protected readonly ocupado = signal(false);
  protected readonly pagando = signal(false);
  protected readonly vendo = signal<{ url: string; titulo: string } | null>(null);
  protected readonly confirmarExclusao = signal(false);
  protected readonly novaFoto = signal<File | null>(null);
  protected readonly parcela = computed(() => this.atual()?.compraId != null);
  protected readonly hoje = hojeIso();
  protected readonly valorOuTraco = valorOuTraco;
  protected readonly dataCurta = dataCurta;
  protected readonly registrarPagamento = (baixa: Baixa) =>
    this.financeiro.pagarConta(this.atual()!.id, baixa).then((c) => this.atual.set(c));

  ngOnInit() {
    this.atual.set(this.conta());
  }

  ngAfterViewInit() {
    this.dialogo().nativeElement.showModal();
  }

  protected escolherFoto(evento: Event) {
    const arquivo = (evento.target as HTMLInputElement).files?.[0] ?? null;
    (evento.target as HTMLInputElement).value = '';
    if (!arquivo) return;
    const conta = this.atual();
    if (!conta) {
      this.novaFoto.set(arquivo);
      return;
    }
    void this.fazer(async () => {
      const { blob, nome } = await prepararArquivo(arquivo);
      this.atual.set(await this.financeiro.trocarFoto(conta.id, blob, nome));
    });
  }

  protected anexarComprovante(evento: Event) {
    const arquivo = (evento.target as HTMLInputElement).files?.[0];
    (evento.target as HTMLInputElement).value = '';
    const conta = this.atual();
    if (!arquivo || !conta) return;
    void this.fazer(async () => {
      const { blob, nome } = await prepararArquivo(arquivo);
      this.atual.set(await this.financeiro.trocarComprovante(conta.id, blob, nome));
    });
  }

  protected async enviar(evento: Event) {
    evento.preventDefault();
    const campos = new FormData(evento.target as HTMLFormElement);
    const texto = (nome: string) => String(campos.get(nome) ?? '').trim();
    const atual = this.atual();
    const dados = {
      nome: atual?.compraId != null ? atual.nome : texto('nome'),
      valor: atual?.compraId != null ? atual.valor : numero(texto('valor')),
      vencimento: texto('vencimento'),
      observacao: texto('observacao'),
    };
    const ok = await this.fazer(async () => {
      if (atual) {
        this.atual.set(await this.financeiro.alterarConta(atual.id, dados));
        return;
      }
      const criada = await this.financeiro.criarConta(dados);
      const foto = this.novaFoto();
      if (foto) {
        const { blob, nome } = await prepararArquivo(foto);
        await this.financeiro.trocarFoto(criada.id, blob, nome);
      }
    });
    if (ok) this.dialogo().nativeElement.close();
  }

  protected desfazerPagamento() {
    const conta = this.atual();
    if (!conta) return;
    void this.fazer(async () => this.atual.set(await this.financeiro.desfazerPagamento(conta.id)));
  }

  protected async excluir() {
    const conta = this.atual();
    if (!conta) return;
    const ok = await this.fazer(() => this.financeiro.excluirConta(conta.id));
    if (ok) this.dialogo().nativeElement.close();
  }

  protected ver(id: number, titulo: string) {
    this.vendo.set({ url: this.financeiro.urlDoArquivo(id), titulo });
  }

  protected irParaCompra() {
    const compra = this.atual()?.compraId;
    if (compra == null) return;
    this.dialogo().nativeElement.close();
    this.abrirCompra.emit(compra);
  }

  protected fecharPeloFundo(evento: MouseEvent) {
    if (evento.target === this.dialogo().nativeElement) this.dialogo().nativeElement.close();
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
