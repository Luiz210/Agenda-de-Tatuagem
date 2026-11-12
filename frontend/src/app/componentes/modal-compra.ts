import { AfterViewInit, Component, ElementRef, OnInit, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { mensagemDeErro } from '../core/agenda';
import { dataCurta, hojeIso } from '../core/datas';
import { Baixa, CompraDetalhe, Conta, Financeiro } from '../core/financeiro';
import { valorOuTraco } from '../core/formatos';
import { reduzirImagem } from '../core/imagens';
import { ModalBaixa } from './modal-baixa';
import { VisualizadorArquivo } from './visualizador-arquivo';

const numero = (texto: string) => {
  const limpo = texto.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  return limpo === '' ? null : Number(limpo);
};

/**
 * Compra parcelada. No cadastro, as parcelas viram contas, uma por mês. No
 * detalhe aparecem todas, e dá para adiantar o pagamento de qualquer uma.
 */
@Component({
  selector: 'app-modal-compra',
  imports: [ModalBaixa, VisualizadorArquivo],
  templateUrl: './modal-compra.html',
  styleUrl: './modal-financeiro.css',
})
export class ModalCompra implements OnInit, AfterViewInit {
  protected readonly financeiro = inject(Financeiro);
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  /** Sem compra, cadastra uma nova. */
  readonly compraId = input<number | null>(null);
  readonly fechar = output<void>();

  protected readonly detalhe = signal<CompraDetalhe | null>(null);
  protected readonly erro = signal('');
  protected readonly ocupado = signal(false);
  protected readonly pagando = signal<Conta | null>(null);
  protected readonly vendo = signal<{ url: string; titulo: string } | null>(null);
  protected readonly confirmarExclusao = signal(false);
  protected readonly novoComprovante = signal<File | null>(null);
  protected readonly valorTotal = signal('');
  protected readonly parcelas = signal('1');
  protected readonly variasParcelas = computed(() => (Number(this.parcelas()) || 1) > 1);
  protected readonly algumaPaga = computed(() => (this.detalhe()?.compra.parcelasPagas ?? 0) > 0);
  protected readonly previa = computed(() => {
    const total = numero(this.valorTotal()) ?? 0;
    const n = Math.max(1, Number(this.parcelas()) || 1);
    return total > 0 ? `${n}× de ${valorOuTraco(Math.floor((total / n) * 100) / 100)}` : '';
  });
  protected readonly hoje = hojeIso();
  protected readonly valorOuTraco = valorOuTraco;
  protected readonly dataCurta = dataCurta;
  protected readonly registrarPagamento = async (baixa: Baixa) => {
    await this.financeiro.pagarConta(this.pagando()!.id, baixa);
    await this.carregar();
  };

  ngOnInit() {
    void this.carregar();
  }

  ngAfterViewInit() {
    this.dialogo().nativeElement.showModal();
  }

  private async carregar(id = this.detalhe()?.compra.id ?? this.compraId()) {
    if (id == null) return;
    try {
      const d = await this.financeiro.compra(id);
      this.detalhe.set(d);
      this.valorTotal.set(String(d.compra.valorTotal).replace('.', ','));
      this.parcelas.set(String(d.compra.parcelas));
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }

  protected escolherComprovante(evento: Event) {
    const arquivo = (evento.target as HTMLInputElement).files?.[0] ?? null;
    (evento.target as HTMLInputElement).value = '';
    if (!arquivo) return;
    const d = this.detalhe();
    if (!d) {
      this.novoComprovante.set(arquivo);
      return;
    }
    void this.fazer(async () => {
      const { blob, nome } = await preparar(arquivo);
      await this.financeiro.trocarComprovanteDaCompra(d.compra.id, blob, nome);
      await this.carregar();
    });
  }

  protected async enviar(evento: Event) {
    evento.preventDefault();
    const campos = new FormData(evento.target as HTMLFormElement);
    const texto = (nome: string) => String(campos.get(nome) ?? '').trim();
    const d = this.detalhe();
    const dados = {
      nome: texto('nome'),
      valorTotal: d && this.algumaPaga() ? d.compra.valorTotal : numero(this.valorTotal()),
      vencimento: d && this.algumaPaga() ? d.compra.vencimento : texto('vencimento'),
      parcelas: d && this.algumaPaga() ? d.compra.parcelas : Number(this.parcelas()) || 1,
      observacao: texto('observacao'),
    };
    const ok = await this.fazer(async () => {
      if (d) {
        this.detalhe.set(await this.financeiro.alterarCompra(d.compra.id, dados));
        return;
      }
      const criada = await this.financeiro.criarCompra(dados);
      const comprovante = this.novoComprovante();
      if (comprovante) {
        const { blob, nome } = await preparar(comprovante);
        await this.financeiro.trocarComprovanteDaCompra(criada.compra.id, blob, nome);
      }
    });
    if (ok) this.dialogo().nativeElement.close();
  }

  protected desfazer(p: Conta) {
    void this.fazer(async () => {
      await this.financeiro.desfazerPagamento(p.id);
      await this.carregar();
    });
  }

  protected async excluir() {
    const d = this.detalhe();
    if (!d) return;
    const ok = await this.fazer(() => this.financeiro.excluirCompra(d.compra.id));
    if (ok) this.dialogo().nativeElement.close();
  }

  protected ver(id: number, titulo: string) {
    this.vendo.set({ url: this.financeiro.urlDoArquivo(id), titulo });
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

async function preparar(arquivo: File): Promise<{ blob: Blob; nome: string }> {
  return arquivo.type.startsWith('image/') ? reduzirImagem(arquivo) : { blob: arquivo, nome: arquivo.name };
}
