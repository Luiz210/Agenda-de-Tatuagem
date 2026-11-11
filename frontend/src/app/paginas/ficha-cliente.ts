import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Autenticacao } from '../core/autenticacao';
import { Agenda, Contato, Ficha, Tatuagem, mensagemDeErro } from '../core/agenda';
import { dataCurta, tempoDesde } from '../core/datas';
import { linkWhatsapp, mensagemDeReengajamento, telefoneFormatado, valorOuTraco } from '../core/formatos';
import { IconeWhatsapp } from '../componentes/icone-whatsapp';
import { ModalAgendar } from '../componentes/modal-agendar';
import { ModalCliente } from '../componentes/modal-cliente';
import { ModalTatuagem } from '../componentes/modal-tatuagem';

/** Ficha do cliente: dados, todas as tatuagens e quanto já pagou. */
@Component({
  selector: 'app-ficha-cliente',
  imports: [IconeWhatsapp, ModalAgendar, ModalCliente, ModalTatuagem, RouterLink],
  templateUrl: './ficha-cliente.html',
  styleUrl: './ficha-cliente.css',
})
export class FichaCliente {
  protected readonly agenda = inject(Agenda);
  protected readonly autenticacao = inject(Autenticacao);
  private readonly router = inject(Router);

  /** Vem da rota clientes/:id. */
  readonly id = input.required<string>();

  protected readonly ficha = signal<Ficha | null>(null);
  protected readonly erro = signal('');
  protected readonly editando = signal(false);
  protected readonly novaTatuagem = signal(false);
  protected readonly aberta = signal<number | null>(null);
  protected readonly confirmarRemocao = signal(false);
  protected readonly telefoneFormatado = telefoneFormatado;
  protected readonly valorOuTraco = valorOuTraco;
  protected readonly dataCurta = dataCurta;
  protected readonly tempoDesde = tempoDesde;
  protected readonly registrandoContato = signal(false);
  protected readonly ocupado = signal(false);

  protected readonly whatsapp = computed(() => linkWhatsapp(this.ficha()?.cliente.telefone));
  /** Para o cliente sumido, o WhatsApp já abre com a mensagem de reengajamento. */
  protected readonly whatsappReengajamento = computed(() => {
    const c = this.ficha()?.cliente;
    return c ? linkWhatsapp(c.telefone, mensagemDeReengajamento(c.nome)) : null;
  });
  protected readonly totalContratado = computed(
    () =>
      this.ficha()
        ?.tatuagens.filter((x) => x.valoresVisiveis)
        .reduce((t, x) => t + Number(x.valorTotal ?? 0), 0) ?? 0,
  );

  constructor() {
    effect(() => {
      this.agenda.versao();
      this.autenticacao.conta();
      void this.carregar(Number(this.id()));
    });
  }

  private async carregar(id: number) {
    try {
      this.ficha.set(await this.agenda.ficha(id));
      this.erro.set('');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }

  protected sessoesFeitas(t: Tatuagem) {
    const ativas = t.sessoes.filter((s) => s.status !== 'CANCELADA');
    return `${ativas.filter((s) => s.status === 'REALIZADA').length} de ${ativas.length}`;
  }

  protected proximaSessao(t: Tatuagem) {
    return t.sessoes.find((s) => s.status === 'AGENDADA');
  }

  protected async registrarContato(evento: Event) {
    evento.preventDefault();
    const observacao = String(new FormData(evento.target as HTMLFormElement).get('observacao') ?? '');
    this.ocupado.set(true);
    try {
      await this.agenda.registrarContato(Number(this.id()), observacao);
      this.registrandoContato.set(false);
      this.erro.set('');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async removerContato(c: Contato) {
    try {
      await this.agenda.removerContato(c.id);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }

  protected quando(c: Contato) {
    return new Date(c.data).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  protected async remover() {
    try {
      await this.agenda.removerCliente(Number(this.id()));
      await this.router.navigate(['/clientes']);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
      this.confirmarRemocao.set(false);
    }
  }
}
