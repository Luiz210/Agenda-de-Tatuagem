import { Component, computed, effect, inject, signal } from '@angular/core';
import { Agenda, mensagemDeErro } from '../core/agenda';
import { Autenticacao } from '../core/autenticacao';
import { dataCurta, hojeIso } from '../core/datas';
import {
  AluguelMes,
  Baixa,
  Compra,
  Conta,
  Financeiro,
  Lancamento,
  Resumo,
  mesPorExtenso,
  outroMes,
} from '../core/financeiro';
import { valorOuTraco } from '../core/formatos';
import { ModalBaixa } from '../componentes/modal-baixa';
import { ModalCompra } from '../componentes/modal-compra';
import { ModalConta } from '../componentes/modal-conta';

type Aba = 'resumo' | 'contas' | 'compras' | 'alugueis' | 'entradas';

const numero = (texto: string) => {
  const limpo = texto.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  return limpo === '' ? null : Number(limpo);
};

const ORIGENS = { CONTA: 'Conta paga', ALUGUEL: 'Aluguel', VENDA: 'Venda de produto', AVULSO: 'Entrada avulsa' };

/** O caixa do estúdio: saldo, contas, compras, aluguéis e entradas. Só para administradores. */
@Component({
  selector: 'app-pagina-financeiro',
  imports: [ModalBaixa, ModalCompra, ModalConta],
  templateUrl: './financeiro.html',
  styleUrl: './financeiro.css',
})
export class PaginaFinanceiro {
  private readonly financeiro = inject(Financeiro);
  private readonly agenda = inject(Agenda);
  protected readonly autenticacao = inject(Autenticacao);

  protected readonly aba = signal<Aba>('resumo');
  protected readonly mes = signal(hojeIso().slice(0, 8) + '01');
  protected readonly erro = signal('');

  protected readonly resumo = signal<Resumo | null>(null);
  protected readonly contas = signal<Conta[]>([]);
  protected readonly compras = signal<Compra[]>([]);
  protected readonly alugueis = signal<AluguelMes[]>([]);
  protected readonly lancamentos = signal<Lancamento[]>([]);
  protected readonly aReceber = signal<Lancamento[]>([]);

  protected readonly editandoConta = signal<Conta | 'nova' | null>(null);
  protected readonly editandoCompra = signal<number | 'nova' | null>(null);
  protected readonly recebendoAluguel = signal<AluguelMes | null>(null);
  protected readonly novaEntrada = signal(false);

  protected readonly podeVer = computed(() => this.autenticacao.admin());
  protected readonly nomeDoMes = computed(() => mesPorExtenso(this.mes()));
  protected readonly totalContasDoMes = computed(() => soma(this.contas().map((c) => c.valor)));
  protected readonly totalPagoDoMes = computed(() =>
    soma(this.contas().filter((c) => c.situacao === 'PAGA').map((c) => c.valor)),
  );
  protected readonly totalAlugueis = computed(() => soma(this.alugueis().map((a) => a.valor)));
  protected readonly totalRecebidoAlugueis = computed(() =>
    soma(this.alugueis().filter((a) => a.situacao === 'PAGO').map((a) => a.valor)),
  );

  protected readonly hoje = hojeIso();
  protected readonly dataCurta = dataCurta;
  protected readonly valorOuTraco = valorOuTraco;
  protected readonly origens = ORIGENS;
  protected readonly receberAluguel = (baixa: Baixa) => {
    const a = this.recebendoAluguel()!;
    return this.financeiro.receberAluguel(a.colaboradorId, this.mes(), baixa);
  };

  constructor() {
    effect(() => {
      this.agenda.versao();
      const aba = this.aba();
      const mes = this.mes();
      if (this.podeVer()) void this.carregar(aba, mes);
    });
  }

  private async carregar(aba: Aba, mes: string) {
    try {
      switch (aba) {
        case 'resumo':
          this.resumo.set(await this.financeiro.resumo());
          break;
        case 'contas':
          this.contas.set(await this.financeiro.contas(mes));
          break;
        case 'compras':
          this.compras.set(await this.financeiro.compras());
          break;
        case 'alugueis':
          this.alugueis.set(await this.financeiro.alugueis(mes));
          break;
        case 'entradas': {
          const [lancamentos, aReceber] = await Promise.all([
            this.financeiro.lancamentos(mes),
            this.financeiro.aReceber(),
          ]);
          this.lancamentos.set(lancamentos);
          this.aReceber.set(aReceber);
          break;
        }
      }
      this.erro.set('');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }

  protected mudarMes(delta: number) {
    this.mes.update((m) => outroMes(m, delta));
  }

  protected async identificar() {
    await this.autenticacao.pedirCodigo();
    if (!this.autenticacao.admin()) this.erro.set('O financeiro é só para administradores.');
  }

  /** A partir de uma parcela, abre a compra dela. */
  protected abrirCompra(id: number) {
    this.editandoConta.set(null);
    this.editandoCompra.set(id);
  }

  protected async desfazerAluguel(a: AluguelMes) {
    if (a.pagamentoId == null) return;
    await this.tentar(() => this.financeiro.desfazerAluguel(a.pagamentoId!));
  }

  protected async lancarEntrada(evento: Event) {
    evento.preventDefault();
    const campos = new FormData(evento.target as HTMLFormElement);
    const texto = (nome: string) => String(campos.get(nome) ?? '').trim();
    const ok = await this.tentar(() =>
      this.financeiro.lancarEntrada({
        descricao: texto('descricao'),
        valor: numero(texto('valor')),
        data: texto('data'),
        recebido: Boolean(campos.get('recebido')),
      }),
    );
    if (ok) this.novaEntrada.set(false);
  }

  protected receberEntrada(l: Lancamento) {
    return this.tentar(() => this.financeiro.receberEntrada(l.id, this.hoje));
  }

  protected removerEntrada(l: Lancamento) {
    return this.tentar(() => this.financeiro.removerEntrada(l.id));
  }

  protected mesesEmTexto(meses: string[]) {
    return meses.map((m) => mesPorExtenso(m).replace(/ de \d{4}$/, '')).join(', ');
  }

  private async tentar(acao: () => Promise<unknown>): Promise<boolean> {
    try {
      await acao();
      this.erro.set('');
      return true;
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
      return false;
    }
  }
}

function soma(valores: number[]) {
  return valores.reduce((t, v) => t + Number(v), 0);
}
