import { AfterViewInit, Component, ElementRef, input, output, signal, viewChild } from '@angular/core';

/**
 * Mostra a foto de uma conta ou um comprovante. Se não for imagem (um PDF),
 * oferece salvar o arquivo, que abre no leitor de PDF do computador.
 */
@Component({
  selector: 'app-visualizador-arquivo',
  template: `
    <dialog #dialogo class="modal" (close)="fechar.emit()" (click)="fecharPeloFundo($event)">
      <div class="modal-corpo">
        <header class="modal-topo">
          <h2>{{ titulo() }}</h2>
          <button type="button" class="botao secundario fechar" aria-label="Fechar" (click)="dialogo.close()">✕</button>
        </header>
        @if (!naoEImagem()) {
          <img [src]="url()" alt="" (error)="naoEImagem.set(true)" />
        } @else {
          <p>Este arquivo não é uma imagem (provavelmente um PDF).</p>
        }
        <div class="acoes">
          <a class="botao secundario" [href]="url()" download>Salvar arquivo</a>
        </div>
      </div>
    </dialog>
  `,
  styles: `
    :host { --largura-modal: 44rem; }
    img { border-radius: 8px; max-height: 70vh; object-fit: contain; width: 100%; }
  `,
})
export class VisualizadorArquivo implements AfterViewInit {
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  readonly url = input.required<string>();
  readonly titulo = input('Arquivo');
  readonly fechar = output<void>();
  protected readonly naoEImagem = signal(false);

  ngAfterViewInit() {
    this.dialogo().nativeElement.showModal();
  }

  protected fecharPeloFundo(evento: MouseEvent) {
    if (evento.target === this.dialogo().nativeElement) this.dialogo().nativeElement.close();
  }
}
