import { AfterViewInit, Component, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { Agenda, Cliente, ClienteDados, mensagemDeErro } from '../core/agenda';
import { telefoneFormatado } from '../core/formatos';

/** Cadastro e edição de cliente. O telefone é opcional. */
@Component({
  selector: 'app-modal-cliente',
  templateUrl: './modal-cliente.html',
})
export class ModalCliente implements AfterViewInit {
  private readonly agenda = inject(Agenda);
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  /** Sem cliente, cadastra um novo. */
  readonly cliente = input<Cliente | null>(null);
  readonly salvo = output<Cliente | null>();
  readonly fechar = output<void>();

  protected readonly erro = signal('');
  protected readonly ocupado = signal(false);
  protected readonly telefoneFormatado = telefoneFormatado;

  ngAfterViewInit() {
    this.dialogo().nativeElement.showModal();
  }

  protected async enviar(evento: Event) {
    evento.preventDefault();
    const campos = new FormData(evento.target as HTMLFormElement);
    const dados: ClienteDados = {
      nome: String(campos.get('nome') ?? ''),
      telefone: String(campos.get('telefone') ?? ''),
      instagram: String(campos.get('instagram') ?? ''),
      observacoes: String(campos.get('observacoes') ?? ''),
    };
    this.ocupado.set(true);
    this.erro.set('');
    try {
      const atual = this.cliente();
      if (atual) {
        await this.agenda.alterarCliente(atual.id, dados);
        this.salvo.emit(null);
      } else {
        this.salvo.emit(await this.agenda.criarCliente(dados));
      }
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
