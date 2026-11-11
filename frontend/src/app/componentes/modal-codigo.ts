import { AfterViewInit, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Autenticacao } from '../core/autenticacao';
import { mensagemDeErro } from '../core/agenda';

/**
 * Pedido do código pessoal no computador do estúdio. Aparece sozinho na
 * primeira alteração; as próximas, por alguns minutos, ficam no nome da pessoa.
 * Quem ainda não tem código entra com usuário e senha.
 */
@Component({
  selector: 'app-modal-codigo',
  templateUrl: './modal-codigo.html',
  styleUrl: './modal-codigo.css',
})
export class ModalCodigo implements AfterViewInit {
  private readonly autenticacao = inject(Autenticacao);
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  private readonly campoCodigo = viewChild<ElementRef<HTMLInputElement>>('campoCodigo');

  protected readonly comSenha = signal(false);
  protected readonly erro = signal('');
  protected readonly ocupado = signal(false);
  private identificado = false;

  ngAfterViewInit() {
    this.dialogo().nativeElement.showModal();
    this.campoCodigo()?.nativeElement.focus();
  }

  protected trocarModo() {
    this.comSenha.update((v) => !v);
    this.erro.set('');
  }

  protected async enviar(evento: Event) {
    evento.preventDefault();
    const campos = new FormData(evento.target as HTMLFormElement);
    const valor = (nome: string) => String(campos.get(nome) ?? '');
    this.ocupado.set(true);
    this.erro.set('');
    try {
      if (this.comSenha()) {
        await this.autenticacao.entrar(valor('identificador'), valor('senha'));
      } else {
        await this.autenticacao.entrarComCodigo(valor('pin'));
      }
      this.identificado = true;
      this.dialogo().nativeElement.close();
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
      const campo = this.campoCodigo()?.nativeElement;
      if (campo) {
        campo.value = '';
        campo.focus();
      }
    } finally {
      this.ocupado.set(false);
    }
  }

  protected fechou() {
    this.autenticacao.concluirPedido(this.identificado);
  }

  protected fecharPeloFundo(evento: MouseEvent) {
    if (evento.target === this.dialogo().nativeElement) this.dialogo().nativeElement.close();
  }
}
