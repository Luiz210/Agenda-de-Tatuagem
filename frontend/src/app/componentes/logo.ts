import { Component, input } from '@angular/core';

/** Gota de tinta vermelha com o brilho da agulha. */
@Component({
  selector: 'app-logo',
  template: `<svg viewBox="0 0 24 28" [attr.width]="tamanho()" [attr.height]="tamanho() * 28 / 24" aria-hidden="true">
    <path d="M12 1C12 1 2 12.2 2 18.2A10 10 0 0 0 22 18.2C22 12.2 12 1 12 1Z" fill="#d90429" />
    <path d="M7.2 18.4a4.8 4.8 0 0 0 4.8 4.8" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" />
  </svg>`,
  styles: ':host { display: inline-flex; }',
})
export class Logo {
  readonly tamanho = input(22);
}
