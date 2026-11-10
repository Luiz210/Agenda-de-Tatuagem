import { Component, computed, input, output } from '@angular/core';
import { SessaoAgenda } from '../core/agenda';
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
  readonly sessao = input.required<SessaoAgenda>();
  readonly mostrarData = input(false);
  readonly urlImagem = input<string | null>(null);
  readonly abrir = output<SessaoAgenda>();

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
}
