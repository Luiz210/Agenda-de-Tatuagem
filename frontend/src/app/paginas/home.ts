import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Agenda, SessaoAgenda, mensagemDeErro } from '../core/agenda';
import { dataPorExtenso, dinheiro, hojeIso, inicioEFimDoMes, somarDias } from '../core/datas';
import { CartaoSessao } from '../componentes/cartao-sessao';
import { ModalAgendar } from '../componentes/modal-agendar';
import { ModalTatuagem } from '../componentes/modal-tatuagem';

const soma = (lista: SessaoAgenda[]) =>
  lista.filter((s) => s.status !== 'CANCELADA').reduce((t, s) => t + Number(s.valor ?? 0), 0);

/** Quem é atendido hoje, quanto entra e o que vem depois. */
@Component({
  selector: 'app-home',
  imports: [CartaoSessao, ModalAgendar, ModalTatuagem, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  protected readonly agenda = inject(Agenda);
  protected readonly hoje = hojeIso();
  protected readonly hojeExtenso = dataPorExtenso(this.hoje);
  protected readonly dinheiro = dinheiro;

  protected readonly deHoje = signal<SessaoAgenda[]>([]);
  protected readonly doMes = signal<SessaoAgenda[]>([]);
  protected readonly proximas = signal<SessaoAgenda[]>([]);
  protected readonly carregado = signal(false);
  protected readonly erro = signal('');
  protected readonly agendando = signal(false);
  protected readonly aberta = signal<SessaoAgenda | null>(null);

  protected readonly ativasHoje = computed(() => this.deHoje().filter((s) => s.status !== 'CANCELADA'));
  protected readonly aReceberHoje = computed(() => soma(this.deHoje()));
  protected readonly previstoNoMes = computed(() => soma(this.doMes()));
  protected readonly sessoesNoMes = computed(
    () => this.doMes().filter((s) => s.status !== 'CANCELADA').length,
  );
  /** Sem atendimento hoje, a próxima sessão ganha destaque. */
  protected readonly proxima = computed(() => (this.ativasHoje().length ? null : this.proximas()[0] ?? null));
  protected readonly depois = computed(() =>
    this.proxima() ? this.proximas().slice(1) : this.proximas(),
  );

  constructor() {
    effect(() => {
      this.agenda.versao();
      void this.carregar();
    });
  }

  private async carregar() {
    const agora = new Date();
    const mes = inicioEFimDoMes(agora.getFullYear(), agora.getMonth());
    try {
      const [hoje, doMes, proximas] = await Promise.all([
        this.agenda.sessoes(this.hoje, this.hoje),
        this.agenda.sessoes(mes.inicio, mes.fim),
        this.agenda.proximas(somarDias(this.hoje, 1), 6),
      ]);
      this.deHoje.set(hoje);
      this.doMes.set(doMes);
      this.proximas.set(proximas);
      this.erro.set('');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.carregado.set(true);
    }
  }

  protected imagem(s: SessaoAgenda) {
    return s.imagemId ? this.agenda.urlDaImagem(s.imagemId) : null;
  }
}
