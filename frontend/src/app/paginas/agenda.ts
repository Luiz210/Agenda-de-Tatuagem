import { Component, computed, effect, inject, signal } from '@angular/core';
import { Agenda, SessaoAgenda, mensagemDeErro } from '../core/agenda';
import { dataPorExtenso, dinheiro, hojeIso, inicioEFimDoMes, mudarMes, nomeDoMes } from '../core/datas';
import { CalendarioAgenda } from '../componentes/calendario-agenda';
import { CartaoSessao } from '../componentes/cartao-sessao';
import { ModalAgendar } from '../componentes/modal-agendar';
import { ModalTatuagem } from '../componentes/modal-tatuagem';

/** O mês inteiro; tocando no dia, aparecem as sessões dele. */
@Component({
  selector: 'app-pagina-agenda',
  imports: [CalendarioAgenda, CartaoSessao, ModalAgendar, ModalTatuagem],
  templateUrl: './agenda.html',
  styleUrl: './agenda.css',
})
export class PaginaAgenda {
  protected readonly agenda = inject(Agenda);
  protected readonly hoje = hojeIso();
  protected readonly ano = signal(new Date().getFullYear());
  protected readonly mes = signal(new Date().getMonth());
  protected readonly dia = signal(this.hoje);
  protected readonly sessoes = signal<SessaoAgenda[]>([]);
  protected readonly erro = signal('');
  protected readonly agendando = signal(false);
  protected readonly aberta = signal<SessaoAgenda | null>(null);

  protected readonly titulo = computed(() => nomeDoMes(this.ano(), this.mes()));
  protected readonly diaExtenso = computed(() => dataPorExtenso(this.dia()));
  protected readonly doDia = computed(() => this.sessoes().filter((s) => s.data === this.dia()));
  protected readonly totalDoDia = computed(() =>
    dinheiro(
      this.doDia()
        .filter((s) => s.status !== 'CANCELADA')
        .reduce((t, s) => t + Number(s.valor ?? 0), 0),
    ),
  );

  constructor() {
    effect(() => {
      this.agenda.versao();
      void this.carregar(this.ano(), this.mes());
    });
  }

  private async carregar(ano: number, mes: number) {
    const { inicio, fim } = inicioEFimDoMes(ano, mes);
    try {
      this.sessoes.set(await this.agenda.sessoes(inicio, fim));
      this.erro.set('');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }

  protected mudar(delta: number) {
    const novo = mudarMes(this.ano(), this.mes(), delta);
    this.ano.set(novo.ano);
    this.mes.set(novo.mes);
    const primeiro = `${novo.ano}-${String(novo.mes + 1).padStart(2, '0')}-01`;
    this.dia.set(this.hoje.startsWith(primeiro.slice(0, 7)) ? this.hoje : primeiro);
  }

  protected irParaHoje() {
    const agora = new Date();
    this.ano.set(agora.getFullYear());
    this.mes.set(agora.getMonth());
    this.dia.set(this.hoje);
  }

  protected imagem(s: SessaoAgenda) {
    return s.imagemId ? this.agenda.urlDaImagem(s.imagemId) : null;
  }
}
