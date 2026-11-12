import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Agenda, SessaoAgenda, mensagemDeErro } from '../core/agenda';
import { Autenticacao } from '../core/autenticacao';
import { dataCurta, dataPorExtenso, dinheiro, hojeIso, inicioEFimDoMes, tempoDesde } from '../core/datas';
import { Conta, mesPorExtenso, outroMes } from '../core/financeiro';
import { valorOuTraco } from '../core/formatos';
import { Painel, Paineis } from '../core/painel';
import { CartaoSessao } from '../componentes/cartao-sessao';
import { ModalAgendar } from '../componentes/modal-agendar';
import { ModalCompra } from '../componentes/modal-compra';
import { ModalConta } from '../componentes/modal-conta';
import { ModalTatuagem } from '../componentes/modal-tatuagem';

/** Só entram as sessões da própria pessoa: os valores das outras vêm vazios. */
const soma = (lista: SessaoAgenda[]) =>
  lista
    .filter((s) => s.status !== 'CANCELADA' && s.valoresVisiveis)
    .reduce((t, s) => t + Number(s.valor ?? 0), 0);

type Periodo = 'mes' | 'ano';

/** Último dia do mês, em ISO. */
function ultimoDia(inicioDoMes: string) {
  const [ano, mes] = inicioDoMes.split('-').map(Number);
  return `${inicioDoMes.slice(0, 8)}${String(new Date(ano, mes, 0).getDate()).padStart(2, '0')}`;
}

/**
 * A tela inicial: os atendimentos de hoje e os números do estúdio no período.
 * Clientes, estoque e produtos vendidos são para todos; o dinheiro do estúdio,
 * só para administradores.
 */
@Component({
  selector: 'app-home',
  imports: [CartaoSessao, ModalAgendar, ModalCompra, ModalConta, ModalTatuagem, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  protected readonly agenda = inject(Agenda);
  private readonly paineis = inject(Paineis);
  protected readonly autenticacao = inject(Autenticacao);
  protected readonly hoje = hojeIso();
  protected readonly hojeExtenso = dataPorExtenso(this.hoje);
  protected readonly dinheiro = dinheiro;
  protected readonly valorOuTraco = valorOuTraco;
  protected readonly dataCurta = dataCurta;
  protected readonly tempoDesde = tempoDesde;

  protected readonly deHoje = signal<SessaoAgenda[]>([]);
  protected readonly doMes = signal<SessaoAgenda[]>([]);
  protected readonly carregado = signal(false);
  protected readonly erro = signal('');
  protected readonly agendando = signal(false);
  protected readonly aberta = signal<SessaoAgenda | null>(null);
  protected readonly abrindoConta = signal<Conta | null>(null);
  protected readonly abrindoCompra = signal<number | null>(null);

  protected readonly ativasHoje = computed(() => this.deHoje().filter((s) => s.status !== 'CANCELADA'));
  protected readonly aReceberHoje = computed(() => soma(this.deHoje()));
  protected readonly previstoNoMes = computed(() => soma(this.doMes()));
  protected readonly sessoesNoMes = computed(
    () => this.doMes().filter((s) => s.status !== 'CANCELADA').length,
  );

  // ---------- Indicadores do estúdio ----------

  protected readonly periodo = signal<Periodo>('mes');
  /** Primeiro dia do mês escolhido (ou de janeiro, no ano). */
  protected readonly referencia = signal(hojeIso().slice(0, 8) + '01');
  protected readonly painel = signal<Painel | null>(null);
  protected readonly intervalo = computed(() => {
    const ref = this.referencia();
    if (this.periodo() === 'ano') {
      const ano = ref.slice(0, 4);
      return { inicio: `${ano}-01-01`, fim: `${ano}-12-31`, nome: ano };
    }
    const nome = mesPorExtenso(ref);
    return { inicio: ref, fim: ultimoDia(ref), nome: nome.charAt(0).toUpperCase() + nome.slice(1) };
  });
  protected readonly paraComprar = computed(
    () => this.painel()?.alertas.filter((a) => a.situacao === 'ABAIXO').length ?? 0,
  );
  protected readonly maiorVenda = computed(() =>
    Math.max(1, ...(this.painel()?.ranking.map((p) => p.vendidos) ?? [1])),
  );

  constructor() {
    effect(() => {
      this.agenda.versao();
      // Os valores dependem de quem está identificado.
      this.autenticacao.conta();
      void this.carregarDia();
    });
    effect(() => {
      this.agenda.versao();
      this.autenticacao.conta();
      const { inicio, fim } = this.intervalo();
      void this.carregarIndicadores(inicio, fim);
    });
  }

  private async carregarDia() {
    const agora = new Date();
    const mes = inicioEFimDoMes(agora.getFullYear(), agora.getMonth());
    try {
      const [hoje, doMes] = await Promise.all([
        this.agenda.sessoes(this.hoje, this.hoje),
        this.agenda.sessoes(mes.inicio, mes.fim),
      ]);
      this.deHoje.set(hoje);
      this.doMes.set(doMes);
      this.erro.set('');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.carregado.set(true);
    }
  }

  private async carregarIndicadores(inicio: string, fim: string) {
    try {
      this.painel.set(await this.paineis.carregar(inicio, fim));
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }

  protected mudarPeriodo(delta: number) {
    this.referencia.update((r) => outroMes(r, this.periodo() === 'ano' ? delta * 12 : delta));
  }

  protected trocarPeriodo(p: Periodo) {
    this.periodo.set(p);
    if (p === 'ano') this.referencia.update((r) => r.slice(0, 4) + '-01-01');
    else this.referencia.set(hojeIso().slice(0, 8) + '01');
  }

  protected identificar() {
    void this.autenticacao.pedirCodigo();
  }

  protected imagem(s: SessaoAgenda) {
    return s.imagemId ? this.agenda.urlDaImagem(s.imagemId) : null;
  }

  protected largura(vendidos: number) {
    return `${Math.round((vendidos / this.maiorVenda()) * 100)}%`;
  }

  protected mesesEmTexto(meses: string[]) {
    return meses.map((m) => mesPorExtenso(m).replace(/ de \d{4}$/, '')).join(', ');
  }
}
