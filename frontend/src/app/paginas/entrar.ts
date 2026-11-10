import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { agendaApp } from '../core/aplicativo';
import { Autenticacao } from '../core/autenticacao';
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

  /** Quem se cadastra por outro computador precisa do código do servidor. */
  protected readonly pedeConvite = agendaApp()?.modo === 'cliente';
  protected readonly modo = signal<Modo>('entrar');
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
        });
      }
      await this.router.navigate(['/']);
    } catch (e) {
      const mensagem = (e as HttpErrorResponse).error?.mensagem;
      this.erro.set(mensagem ?? 'Não foi possível falar com o aplicativo. Tente novamente.');
    } finally {
      this.ocupado.set(false);
    }
  }
}
