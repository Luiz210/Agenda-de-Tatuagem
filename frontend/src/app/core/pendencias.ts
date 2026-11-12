import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Agenda } from './agenda';
import { Autenticacao } from './autenticacao';

/** O que está esperando alguém, para os números do menu lateral. */
export interface Pendencias {
  /** Sessões de hoje até daqui a 2 dias que o cliente ainda não confirmou. */
  agenda: number;
  clientes: number;
  estoque: number;
  produtos: number;
}

/** Outra pessoa pode mudar algo em outro computador: confere de tempos em tempos. */
const INTERVALO_MS = 5 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class AvisosDoMenu {
  private readonly http = inject(HttpClient);
  private readonly agenda = inject(Agenda);
  private readonly autenticacao = inject(Autenticacao);

  readonly pendencias = signal<Pendencias | null>(null);

  constructor() {
    effect(() => {
      // Recalcula a cada alteração feita aqui e quando muda quem está usando.
      this.agenda.versao();
      const podeConsultar = this.autenticacao.estudio() || this.autenticacao.conta() !== null;
      if (podeConsultar) void this.atualizar();
    });
    setInterval(() => {
      if (this.autenticacao.estudio() || this.autenticacao.conta()) void this.atualizar();
    }, INTERVALO_MS);
  }

  async atualizar() {
    try {
      this.pendencias.set(await firstValueFrom(this.http.get<Pendencias>('/api/pendencias')));
    } catch {
      // Sem os números, o menu só fica sem os avisos até a próxima tentativa.
    }
  }
}
