import { Component, effect, inject, signal } from '@angular/core';
import { Agenda, mensagemDeErro } from '../core/agenda';
import { Autenticacao } from '../core/autenticacao';
import { Colaborador, Colaboradores } from '../core/colaboradores';
import { telefoneFormatado, valorOuTraco } from '../core/formatos';
import { ModalColaborador } from '../componentes/modal-colaborador';

/** Pessoas do estúdio. Todos veem a lista; só administradores cadastram e veem o aluguel. */
@Component({
  selector: 'app-pagina-colaboradores',
  imports: [ModalColaborador],
  templateUrl: './colaboradores.html',
  styleUrl: './colaboradores.css',
})
export class PaginaColaboradores {
  private readonly agenda = inject(Agenda);
  private readonly colaboradores = inject(Colaboradores);
  protected readonly autenticacao = inject(Autenticacao);

  protected readonly lista = signal<Colaborador[]>([]);
  protected readonly erro = signal('');
  protected readonly editando = signal<Colaborador | 'novo' | null>(null);
  protected readonly telefoneFormatado = telefoneFormatado;
  protected readonly valorOuTraco = valorOuTraco;

  constructor() {
    effect(() => {
      this.agenda.versao();
      // O aluguel só vem para administradores: recarrega quando muda quem está identificado.
      this.autenticacao.conta();
      void this.carregar();
    });
  }

  private async carregar() {
    try {
      this.lista.set(await this.colaboradores.listar());
      this.erro.set('');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }

  /** No estúdio, pede o código de um administrador antes de abrir o cadastro. */
  protected async abrir(c: Colaborador | 'novo') {
    if (!this.autenticacao.admin()) {
      if (!this.autenticacao.estudio() || !(await this.autenticacao.pedirCodigo())) return;
      if (!this.autenticacao.admin()) {
        this.erro.set('Só um administrador pode cadastrar ou alterar colaboradores.');
        return;
      }
      // Recarrega para trazer os dados de aluguel antes de editar.
      await this.carregar();
      if (c !== 'novo') {
        const id = c.id;
        c = this.lista().find((x) => x.id === id) ?? c;
      }
    }
    this.editando.set(c);
  }

  protected rotuloAluguel(c: Colaborador) {
    if (c.valorAluguel == null) return '—';
    return c.diaPagamentoAluguel ? `${valorOuTraco(c.valorAluguel)} · dia ${c.diaPagamentoAluguel}` : valorOuTraco(c.valorAluguel);
  }
}
