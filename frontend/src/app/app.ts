import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Autenticacao } from './core/autenticacao';
import { dataPorExtenso, hojeIso } from './core/datas';
import { Logo } from './componentes/logo';
import { EstadoAtualizacao, agendaApp } from './core/aplicativo';

@Component({
  imports: [Logo, RouterLink, RouterLinkActive, RouterOutlet],
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
      await this.router.navigate(['/entrar']);
    }
  }

  @HostListener('document:click')
  @HostListener('document:keydown.escape')
  protected fecharMenu() {
    this.menuAberto.set(false);
  }
}
