import {
  AfterViewInit,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Agenda, Sessao, SessaoAgenda, StatusSessao, Tatuagem, mensagemDeErro } from '../core/agenda';
import { dataCurta, dataPorExtenso, hojeIso } from '../core/datas';
import {
  duracaoEmTexto,
  horaCurta,
  linkWhatsapp,
  mensagemDeConfirmacao,
  valorOuTraco,
} from '../core/formatos';
import { reduzirImagem } from '../core/imagens';
import { IconeWhatsapp } from './icone-whatsapp';
import { DURACOES, LOCAIS_DO_CORPO } from './locais-corpo';

const numero = (texto: string) => {
  const limpo = texto.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  return limpo === '' ? null : Number(limpo);
};

const ROTULOS: Record<StatusSessao, string> = {
  AGENDADA: 'Agendada',
  REALIZADA: 'Realizada',
  CANCELADA: 'Cancelada',
};

export const FORMAS_DE_PAGAMENTO = ['Pix', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Outro'];

/** Tudo de uma tatuagem: imagens, sessões e pagamentos. */
@Component({
  selector: 'app-modal-tatuagem',
  imports: [IconeWhatsapp, NgTemplateOutlet, RouterLink],
  templateUrl: './modal-tatuagem.html',
  styleUrl: './modal-tatuagem.css',
})
export class ModalTatuagem implements AfterViewInit {
  protected readonly agenda = inject(Agenda);
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  readonly tatuagemId = input.required<number>();
  /** Sessão clicada na agenda, mostrada em destaque. */
  readonly sessaoId = input<number | null>(null);
  readonly fechar = output<void>();

  protected readonly tatuagem = signal<Tatuagem | null>(null);
  protected readonly erro = signal('');
  protected readonly ocupado = signal(false);
  protected readonly editandoDados = signal(false);
  protected readonly editandoSessao = signal<number | 'nova' | null>(null);
  protected readonly novoPagamento = signal(false);
  protected readonly ampliada = signal<number | null>(null);
  protected readonly confirmarRemocao = signal(false);

  protected readonly locais = LOCAIS_DO_CORPO;
  protected readonly duracoes = DURACOES;
  protected readonly formas = FORMAS_DE_PAGAMENTO;
  protected readonly rotulos = ROTULOS;
  protected readonly hoje = hojeIso();
  protected readonly dataPorExtenso = dataPorExtenso;
  protected readonly dataCurta = dataCurta;
  protected readonly horaCurta = horaCurta;
  protected readonly duracaoEmTexto = duracaoEmTexto;
  protected readonly valorOuTraco = valorOuTraco;

  protected readonly falta = computed(() => {
    const t = this.tatuagem();
    return t?.valorTotal != null ? Math.max(0, Number(t.valorTotal) - Number(t.totalPago)) : null;
  });
  protected readonly ativas = computed(
    () => this.tatuagem()?.sessoes.filter((s) => s.status !== 'CANCELADA') ?? [],
  );

  async ngAfterViewInit() {
    this.dialogo().nativeElement.showModal();
    await this.carregar();
  }

  private async carregar() {
    try {
      this.tatuagem.set(await this.agenda.tatuagem(this.tatuagemId()));
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }

  /** Executa uma alteração e recarrega a tatuagem. */
  private async fazer(acao: () => Promise<unknown>) {
    this.ocupado.set(true);
    this.erro.set('');
    try {
      await acao();
      await this.carregar();
      return true;
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
      return false;
    } finally {
      this.ocupado.set(false);
    }
  }

  protected numeroDaSessao(s: Sessao): number {
    return this.ativas().findIndex((a) => a.id === s.id) + 1;
  }

  protected whatsapp(s: Sessao): string | null {
    const t = this.tatuagem();
    if (!t || s.status !== 'AGENDADA') return null;
    const linha: SessaoAgenda = {
      ...s,
      tatuagemId: t.id,
      descricao: t.descricao,
      localCorpo: t.localCorpo,
      valorTotal: t.valorTotal,
      clienteId: t.clienteId,
      clienteNome: t.clienteNome,
      clienteTelefone: t.clienteTelefone,
      numero: this.numeroDaSessao(s),
      totalSessoes: this.ativas().length,
      imagemId: null,
    };
    return linkWhatsapp(t.clienteTelefone, mensagemDeConfirmacao(linha));
  }

  protected async salvarDados(evento: Event) {
    evento.preventDefault();
    const t = this.tatuagem()!;
    const campos = new FormData(evento.target as HTMLFormElement);
    const texto = (nome: string) => String(campos.get(nome) ?? '').trim();
    const ok = await this.fazer(() =>
      this.agenda.alterarTatuagem(t.id, {
        clienteId: t.clienteId,
        descricao: texto('descricao'),
        localCorpo: texto('localCorpo'),
        valorTotal: numero(texto('valorTotal')),
      }),
    );
    if (ok) this.editandoDados.set(false);
  }

  protected async salvarSessao(evento: Event, sessao: Sessao | null) {
    evento.preventDefault();
    const campos = new FormData(evento.target as HTMLFormElement);
    const texto = (nome: string) => String(campos.get(nome) ?? '').trim();
    const dados = {
      tatuagemId: this.tatuagemId(),
      data: texto('data'),
      hora: texto('hora'),
      duracaoMinutos: numero(texto('duracao')),
      valor: numero(texto('valor')),
      observacao: texto('observacao'),
      status: sessao?.status,
    };
    const ok = await this.fazer(() =>
      sessao ? this.agenda.alterarSessao(sessao.id, dados) : this.agenda.criarSessao(dados),
    );
    if (ok) this.editandoSessao.set(null);
  }

  protected mudarStatus(s: Sessao, status: StatusSessao) {
    return this.fazer(() =>
      this.agenda.alterarSessao(s.id, { ...s, tatuagemId: this.tatuagemId(), status }),
    );
  }

  protected removerSessao(s: Sessao) {
    return this.fazer(() => this.agenda.removerSessao(s.id));
  }

  protected async salvarPagamento(evento: Event) {
    evento.preventDefault();
    const campos = new FormData(evento.target as HTMLFormElement);
    const texto = (nome: string) => String(campos.get(nome) ?? '').trim();
    const ok = await this.fazer(() =>
      this.agenda.criarPagamento({
        tatuagemId: this.tatuagemId(),
        data: texto('data'),
        valor: numero(texto('valor')) ?? 0,
        forma: texto('forma'),
        observacao: texto('observacao'),
      }),
    );
    if (ok) this.novoPagamento.set(false);
  }

  protected removerPagamento(id: number) {
    return this.fazer(() => this.agenda.removerPagamento(id));
  }

  protected async adicionarImagens(evento: Event) {
    const campo = evento.target as HTMLInputElement;
    const arquivos = [...(campo.files ?? [])].filter((f) => f.type.startsWith('image/'));
    campo.value = '';
    await this.fazer(async () => {
      for (const arquivo of arquivos) {
        const { blob, nome } = await reduzirImagem(arquivo);
        await this.agenda.adicionarImagem(this.tatuagemId(), blob, nome);
      }
    });
  }

  protected async removerImagem(id: number) {
    if (await this.fazer(() => this.agenda.removerImagem(id))) this.ampliada.set(null);
  }

  protected async removerTatuagem() {
    if (await this.fazer(() => this.agenda.removerTatuagem(this.tatuagemId()))) {
      this.dialogo().nativeElement.close();
    }
  }

  protected fecharPeloFundo(evento: MouseEvent) {
    if (evento.target === this.dialogo().nativeElement) this.dialogo().nativeElement.close();
  }
}
