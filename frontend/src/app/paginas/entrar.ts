import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Autenticacao } from '../core/autenticacao';
import { mensagemDeErro } from '../core/agenda';
import { Logo } from '../componentes/logo';

type Modo = 'entrar' | 'cadastrar';

@Component({
  selector: 'app-entrar',
  imports: [Logo],
  templateUrl: './entrar.html',
  styleUrl: './entrar.css',
})
export class Entrar {
  private readonly autenticacao = inject(Autenticacao);
  private readonly router = inject(Router);

  /**
   * No computador do estúdio esta tela só aparece na primeira abertura, para
   * criar a conta do administrador. Nos outros, é o login normal.
   */
  protected readonly primeiraConta = computed(() => this.autenticacao.estudio());
  protected readonly modo = signal<Modo>(this.autenticacao.estudio() ? 'cadastrar' : 'entrar');
  protected readonly erro = signal('');
  protected readonly ocupado = signal(false);

  protected trocar(modo: Modo) {
    this.modo.set(modo);
    this.erro.set('');
  }

  protected async enviar(evento: Event) {
    evento.preventDefault();
    const campos = new FormData(evento.target as HTMLFormElement);
    const valor = (nome: string) => String(campos.get(nome) ?? '');

    if (this.modo() === 'cadastrar' && valor('senha') !== valor('confirmacao')) {
      this.erro.set('As senhas não são iguais.');
      return;
    }

    this.ocupado.set(true);
    this.erro.set('');
    try {
      if (this.modo() === 'entrar') {
        await this.autenticacao.entrar(valor('identificador'), valor('senha'));
      } else {
        await this.autenticacao.cadastrar({
          nome: valor('nome'),
          nomeUsuario: valor('nomeUsuario'),
          email: valor('email'),
          senha: valor('senha'),
          convite: valor('convite'),
          pin: valor('pin'),
        });
      }
      await this.router.navigate(['/']);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
