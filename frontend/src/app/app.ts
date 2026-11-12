import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Autenticacao } from './core/autenticacao';
import { dataPorExtenso, hojeIso } from './core/datas';
import { Logo } from './componentes/logo';
import { EstadoAtualizacao, agendaApp } from './core/aplicativo';
import { Colaboradores } from './core/colaboradores';
import { AvisosDoMenu } from './core/pendencias';
import { ModalCodigo } from './componentes/modal-codigo';
import { ModalMeuCodigo } from './componentes/modal-meu-codigo';

@Component({
  imports: [Logo, ModalCodigo, ModalMeuCodigo, RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly autenticacao = inject(Autenticacao);
  private readonly router = inject(Router);
  protected readonly hoje = dataPorExtenso(hojeIso());
  protected readonly menuAberto = signal(false);
  protected readonly noAplicativo = agendaApp() !== null;
  protected readonly trocandoCodigo = signal(false);
  protected readonly avisos = inject(AvisosDoMenu).pendencias;

  /** As telas aparecem com login (em casa) ou sempre (no computador do estúdio, depois da primeira conta). */
  protected readonly mostrarTelas = computed(() => {
    const estado = this.autenticacao.estado();
    return estado?.estudio ? estado.temContas : this.autenticacao.conta() !== null;
  });
  protected readonly tempoRestante = computed(() => {
    const s = this.autenticacao.segundosRestantes();
    return s == null ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });

  protected readonly atualizacao = signal<EstadoAtualizacao | null>(null);
  protected readonly avisoFechado = signal(false);
  protected readonly prontaParaInstalar = computed(() => this.atualizacao()?.fase === 'pronta');
  protected readonly statusAtualizacao = computed(() => {
    const a = this.atualizacao();
    switch (a?.fase) {
      case 'verificando':
        return 'Buscando atualizações...';
      case 'baixando':
        return `Baixando a versão ${a.versao}: ${a.progresso ?? 0}%`;
      case 'pronta':
        return `A versão ${a.versao} está pronta.`;
      case 'atualizado':
        return 'Você está na versão mais recente.';
      case 'erro':
        return 'Não foi possível buscar. Confira a internet e tente de novo.';
      default:
        return '';
    }
  });

  constructor() {
    const colaboradores = inject(Colaboradores);
    // Depois de entrar em casa, a lista de pessoas passa a ser permitida.
    effect(() => {
      if (this.autenticacao.conta()) void colaboradores.carregarPessoas();
    });

    const app = agendaApp();
    if (!app) return;
    void app.lerAtualizacao().then((estado) => this.atualizacao.set(estado));
    app.ouvirAtualizacao((estado) => {
      if (estado.fase === 'pronta') this.avisoFechado.set(false);
      this.atualizacao.set(estado);
    });
  }

  protected abrirConexao() {
    agendaApp()?.abrirConexao();
  }

  /** Mantém o menu aberto para mostrar o andamento da busca. */
  protected buscarAtualizacao(evento: Event) {
    evento.stopPropagation();
    agendaApp()?.buscarAtualizacao();
  }

  protected instalarAtualizacao() {
    agendaApp()?.instalarAtualizacao();
  }

  protected alternarMenu(evento: Event) {
    evento.stopPropagation();
    this.menuAberto.update((v) => !v);
  }

  protected async sair() {
    try {
      await this.autenticacao.sair();
    } finally {
      // No estúdio as telas continuam abertas; só deixa de alterar no nome da pessoa.
      if (!this.autenticacao.estudio()) await this.router.navigate(['/entrar']);
    }
  }

  protected identificar() {
    void this.autenticacao.pedirCodigo();
  }

  protected trocarCodigo() {
    this.trocandoCodigo.set(true);
  }

  @HostListener('document:click')
  @HostListener('document:keydown.escape')
  protected fecharMenu() {
    this.menuAberto.set(false);
  }
}
