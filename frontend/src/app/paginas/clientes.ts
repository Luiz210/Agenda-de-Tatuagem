import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Autenticacao } from '../core/autenticacao';
import { Agenda, Cliente, mensagemDeErro } from '../core/agenda';
import { dataCurta } from '../core/datas';
import { telefoneFormatado, valorOuTraco } from '../core/formatos';
import { ModalCliente } from '../componentes/modal-cliente';

const semAcento = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

@Component({
  selector: 'app-clientes',
  imports: [ModalCliente],
  templateUrl: './clientes.html',
  styleUrl: './clientes.css',
})
export class Clientes {
  private readonly agenda = inject(Agenda);
  protected readonly autenticacao = inject(Autenticacao);
  private readonly router = inject(Router);
  protected readonly clientes = signal<Cliente[]>([]);
  protected readonly busca = signal('');
  protected readonly erro = signal('');
  protected readonly cadastrando = signal(false);
  protected readonly telefoneFormatado = telefoneFormatado;
  protected readonly valorOuTraco = valorOuTraco;
  protected readonly dataCurta = dataCurta;

  protected readonly filtrados = computed(() => {
    const termo = semAcento(this.busca().trim());
    const digitos = termo.replace(/\D/g, '');
    if (!termo) return this.clientes();
    return this.clientes().filter(
      (c) =>
        semAcento(c.nome).includes(termo) ||
        (c.instagram ?? '').includes(termo.replace(/^@/, '')) ||
        (digitos.length >= 3 && (c.telefone ?? '').includes(digitos)),
    );
  });

  constructor() {
    effect(() => {
      this.agenda.versao();
      this.autenticacao.conta();
      void this.carregar();
    });
  }

  private async carregar() {
    try {
      this.clientes.set(await this.agenda.clientes());
      this.erro.set('');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }

  protected abrir(c: Cliente) {
    void this.router.navigate(['/clientes', c.id]);
  }

  protected criado(c: Cliente | null) {
    if (c) this.abrir(c);
  }
}
