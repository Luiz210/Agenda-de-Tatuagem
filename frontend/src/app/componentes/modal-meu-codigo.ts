import { AfterViewInit, Component, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { Autenticacao } from '../core/autenticacao';
import { mensagemDeErro } from '../core/agenda';

/** Cada pessoa troca o próprio código do computador do estúdio. */
@Component({
  selector: 'app-modal-meu-codigo',
  template: `
    <dialog #dialogo class="modal" (close)="fechar.emit()" (click)="fecharPeloFundo($event)">
      <form class="modal-corpo" (submit)="enviar($event)">
        <header class="modal-topo">
          <div>
            <h2>Meu código</h2>
            <p>Usado para se identificar no computador do estúdio.</p>
          </div>
          <button type="button" class="botao secundario fechar" aria-label="Fechar" (click)="dialogo.close()">✕</button>
        </header>
        @if (erro()) {
          <p class="aviso-erro" role="alert">{{ erro() }}</p>
        }
        @if (salvo()) {
          <p role="status">Código trocado.</p>
        } @else {
          <div class="linha-campos">
            <label class="campo">
              Novo código
              <input name="pin" type="password" inputmode="numeric" pattern="\\d{4,6}" maxlength="6" required autocomplete="off" />
            </label>
            <label class="campo">
              Repita o código
              <input name="confirmacao" type="password" inputmode="numeric" maxlength="6" required autocomplete="off" />
            </label>
          </div>
          <p class="vazio-texto">De 4 a 6 números. Não use um código igual ao de outra pessoa.</p>
        }
        <div class="acoes">
          @if (salvo()) {
            <button type="button" class="botao" (click)="dialogo.close()">Fechar</button>
          } @else {
            <button class="botao" [disabled]="ocupado()">Salvar</button>
          }
        </div>
      </form>
    </dialog>
  `,
  styles: ':host { --largura-modal: 26rem; }',
})
export class ModalMeuCodigo implements AfterViewInit {
  private readonly autenticacao = inject(Autenticacao);
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  readonly fechar = output<void>();

  protected readonly erro = signal('');
  protected readonly ocupado = signal(false);
  protected readonly salvo = signal(false);

  ngAfterViewInit() {
    this.dialogo().nativeElement.showModal();
  }

  protected async enviar(evento: Event) {
    evento.preventDefault();
    const campos = new FormData(evento.target as HTMLFormElement);
    const pin = String(campos.get('pin') ?? '');
    if (pin !== String(campos.get('confirmacao') ?? '')) {
      this.erro.set('Os códigos não são iguais.');
      return;
    }
    this.ocupado.set(true);
    this.erro.set('');
    try {
      await this.autenticacao.trocarCodigo(pin);
      this.salvo.set(true);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected fecharPeloFundo(evento: MouseEvent) {
    if (evento.target === this.dialogo().nativeElement) this.dialogo().nativeElement.close();
  }
}
