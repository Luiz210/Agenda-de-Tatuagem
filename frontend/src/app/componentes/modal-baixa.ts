import { AfterViewInit, Component, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { mensagemDeErro } from '../core/agenda';
import { hojeIso } from '../core/datas';
import { Baixa } from '../core/financeiro';
import { valorOuTraco } from '../core/formatos';
import { FORMAS_DE_PAGAMENTO } from './modal-tatuagem';

/**
 * Registra um pagamento: conta paga (com comprovante opcional) ou aluguel
 * recebido. Quem abre faz a chamada ao servidor e mostra o erro, se houver.
 */
@Component({
  selector: 'app-modal-baixa',
  template: `
    <dialog #dialogo class="modal" (close)="fechar.emit()" (click)="fecharPeloFundo($event)">
      <form class="modal-corpo" (submit)="enviar($event)">
        <header class="modal-topo">
          <div>
            <h2>{{ titulo() }}</h2>
            <p>{{ descricao() }} · <strong>{{ valorOuTraco(valor()) }}</strong></p>
          </div>
          <button type="button" class="botao secundario fechar" aria-label="Fechar" (click)="dialogo.close()">✕</button>
        </header>
        @if (erro()) {
          <p class="aviso-erro" role="alert">{{ erro() }}</p>
        }
        <div class="linha-campos">
          <label class="campo">
            Data
            <input name="data" type="date" required [value]="hoje" />
          </label>
          <label class="campo">
            Forma de pagamento
            <select name="forma">
              @for (f of formas; track f) {
                <option [value]="f">{{ f }}</option>
              }
            </select>
          </label>
        </div>
        @if (comComprovante()) {
          <label class="campo">
            <span>Comprovante <small>(foto ou PDF, opcional)</small></span>
            <input name="arquivo" type="file" accept="image/*,application/pdf" />
          </label>
        }
        <div class="acoes">
          <button class="botao" [disabled]="ocupado()">{{ ocupado() ? 'Salvando...' : titulo() }}</button>
        </div>
      </form>
    </dialog>
  `,
  styles: ':host { --largura-modal: 28rem; }',
})
export class ModalBaixa implements AfterViewInit {
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  readonly titulo = input.required<string>();
  readonly descricao = input.required<string>();
  readonly valor = input.required<number>();
  readonly comComprovante = input(false);
  /** Faz o registro; se lançar erro, ele aparece aqui e a janela continua aberta. */
  readonly registrar = input.required<(baixa: Baixa) => Promise<unknown>>();
  readonly fechar = output<void>();

  protected readonly hoje = hojeIso();
  protected readonly formas = FORMAS_DE_PAGAMENTO;
  protected readonly valorOuTraco = valorOuTraco;
  protected readonly erro = signal('');
  protected readonly ocupado = signal(false);

  ngAfterViewInit() {
    this.dialogo().nativeElement.showModal();
  }

  protected async enviar(evento: Event) {
    evento.preventDefault();
    const campos = new FormData(evento.target as HTMLFormElement);
    const arquivo = campos.get('arquivo');
    const temArquivo = arquivo instanceof File && arquivo.size > 0;
    this.ocupado.set(true);
    this.erro.set('');
    try {
      await this.registrar()({
        data: String(campos.get('data') ?? this.hoje),
        forma: String(campos.get('forma') ?? ''),
        arquivo: temArquivo ? arquivo : null,
        nomeArquivo: temArquivo ? arquivo.name : undefined,
      });
      this.dialogo().nativeElement.close();
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
