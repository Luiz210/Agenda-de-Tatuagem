import { Component, computed, inject, input, output, signal } from '@angular/core';
import { Agenda, SessaoAgenda } from '../core/agenda';
import { diaCurto } from '../core/datas';
import {
  duracaoEmTexto,
  horaCurta,
  linkWhatsapp,
  mensagemDeConfirmacao,
  valorOuTraco,
} from '../core/formatos';
import { IconeWhatsapp } from './icone-whatsapp';

const ROTULOS = { AGENDADA: 'Agendada', REALIZADA: 'Realizada', CANCELADA: 'Cancelada' };

/** Uma sessão da agenda: horário, cliente, local do corpo, valor e confirmação. */
@Component({
  selector: 'app-cartao-sessao',
  imports: [IconeWhatsapp],
  templateUrl: './cartao-sessao.html',
  styleUrl: './cartao-sessao.css',
})
export class CartaoSessao {
  private readonly agenda = inject(Agenda);
  readonly sessao = input.required<SessaoAgenda>();
  readonly mostrarData = input(false);
  readonly urlImagem = input<string | null>(null);
  readonly abrir = output<SessaoAgenda>();

  protected readonly ocupado = signal(false);
  protected readonly horaCurta = horaCurta;
  protected readonly valorOuTraco = valorOuTraco;
  protected readonly diaCurto = diaCurto;
  protected readonly duracao = computed(() => duracaoEmTexto(this.sessao().duracaoMinutos));
  protected readonly status = computed(() => ROTULOS[this.sessao().status]);
  protected readonly whatsapp = computed(() =>
    this.sessao().status === 'AGENDADA'
      ? linkWhatsapp(this.sessao().clienteTelefone, mensagemDeConfirmacao(this.sessao()))
      : null,
  );

  /** Depois de o cliente responder no WhatsApp: tira a sessão do aviso da Agenda. */
  protected async confirmar(confirmada: boolean) {
    this.ocupado.set(true);
    try {
      await this.agenda.confirmarSessao(this.sessao().id, confirmada);
    } catch {
      // A tela recarrega na próxima alteração; o estado continua o do servidor.
    } finally {
      this.ocupado.set(false);
    }
  }
}
