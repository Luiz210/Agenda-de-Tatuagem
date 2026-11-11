import { AfterViewInit, Component, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { mensagemDeErro } from '../core/agenda';
import { Colaborador, ColaboradorDados, Colaboradores } from '../core/colaboradores';
import { telefoneFormatado } from '../core/formatos';
import { Perfil } from '../core/autenticacao';

const numero = (texto: string) => {
  const limpo = texto.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  return limpo === '' ? null : Number(limpo);
};

/** Cadastro e edição de colaborador, feitos por um administrador. */
@Component({
  selector: 'app-modal-colaborador',
  templateUrl: './modal-colaborador.html',
  styleUrl: './modal-agendar.css',
})
export class ModalColaborador implements AfterViewInit {
  private readonly colaboradores = inject(Colaboradores);
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  /** Sem colaborador, cadastra um novo. */
  readonly colaborador = input<Colaborador | null>(null);
  readonly fechar = output<void>();

  protected readonly erro = signal('');
  protected readonly ocupado = signal(false);
  protected readonly confirmarExclusao = signal(false);
  protected readonly telefoneFormatado = telefoneFormatado;

  ngAfterViewInit() {
    this.dialogo().nativeElement.showModal();
  }

  protected async enviar(evento: Event) {
    evento.preventDefault();
    const campos = new FormData(evento.target as HTMLFormElement);
    const texto = (nome: string) => String(campos.get(nome) ?? '').trim();
    const dados: ColaboradorDados = {
      nome: texto('nome'),
      funcao: texto('funcao'),
      telefone: texto('telefone'),
      valorAluguel: numero(texto('valorAluguel')),
      diaPagamentoAluguel: numero(texto('diaPagamentoAluguel')),
      perfil: texto('perfil') as Perfil,
      nomeUsuario: texto('nomeUsuario'),
      email: texto('email'),
      senha: String(campos.get('senha') ?? ''),
      pin: texto('pin'),
    };
    this.ocupado.set(true);
    this.erro.set('');
    try {
      const atual = this.colaborador();
      if (atual) await this.colaboradores.alterar(atual.id, dados);
      else await this.colaboradores.criar(dados);
      this.dialogo().nativeElement.close();
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async excluir() {
    const atual = this.colaborador();
    if (!atual) return;
    this.ocupado.set(true);
    this.erro.set('');
    try {
      await this.colaboradores.excluir(atual.id);
      this.dialogo().nativeElement.close();
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
      this.confirmarExclusao.set(false);
    } finally {
      this.ocupado.set(false);
    }
  }

  protected fecharPeloFundo(evento: MouseEvent) {
    if (evento.target === this.dialogo().nativeElement) this.dialogo().nativeElement.close();
  }
}
