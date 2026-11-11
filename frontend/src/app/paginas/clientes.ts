import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Autenticacao } from '../core/autenticacao';
import { Agenda, Cliente, mensagemDeErro } from '../core/agenda';
import { dataCurta, tempoDesde } from '../core/datas';
import { linkWhatsapp, mensagemDeReengajamento, telefoneFormatado, valorOuTraco } from '../core/formatos';
import { IconeWhatsapp } from '../componentes/icone-whatsapp';
import { ModalCliente } from '../componentes/modal-cliente';

const semAcento = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

@Component({
  selector: 'app-clientes',
  imports: [IconeWhatsapp, ModalCliente],
  templateUrl: './clientes.html',
  styleUrl: './clientes.css',
})
export class Clientes {
  private readonly agenda = inject(Agenda);
  protected readonly autenticacao = inject(Autenticacao);
  private readonly router = inject(Router);

  /** ?filtro=contatar abre direto a lista de quem precisa ser procurado (link da tela Hoje). */
  readonly filtro = input<string>();
  protected readonly soParaContatar = linkedSignal(() => this.filtro() === 'contatar');

  protected readonly clientes = signal<Cliente[]>([]);
  protected readonly busca = signal('');
  protected readonly erro = signal('');
  protected readonly cadastrando = signal(false);
  protected readonly ocupado = signal<number | null>(null);
  protected readonly telefoneFormatado = telefoneFormatado;
  protected readonly valorOuTraco = valorOuTraco;
  protected readonly dataCurta = dataCurta;
  protected readonly tempoDesde = tempoDesde;

  protected readonly paraContatar = computed(() => this.clientes().filter((c) => c.paraContatar));

  protected readonly filtrados = computed(() => {
    const termo = semAcento(this.busca().trim());
    const digitos = termo.replace(/\D/g, '');
    // Para contatar: quem sumiu há mais tempo aparece primeiro.
    const base = this.soParaContatar()
      ? [...this.paraContatar()].sort((a, b) => (a.ultimaSessao ?? '').localeCompare(b.ultimaSessao ?? ''))
      : this.clientes();
    if (!termo) return base;
    return base.filter(
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

  protected whatsapp(c: Cliente) {
    return linkWhatsapp(c.telefone, mensagemDeReengajamento(c.nome));
  }

  protected async marcarContatado(c: Cliente) {
    this.ocupado.set(c.id);
    try {
      await this.agenda.registrarContato(c.id);
      this.erro.set('');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.ocupado.set(null);
    }
  }
}
