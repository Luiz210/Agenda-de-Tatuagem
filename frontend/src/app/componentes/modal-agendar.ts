import {
  AfterViewInit,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Agenda, Cliente, Tatuagem, mensagemDeErro } from '../core/agenda';
import { dataPorExtenso, dinheiro, hojeIso } from '../core/datas';
import { duracaoEmTexto, valorOuTraco } from '../core/formatos';
import { reduzirImagem } from '../core/imagens';
import { DURACOES, LOCAIS_DO_CORPO } from './locais-corpo';

const NOVA = 'nova';
const NOVO = 'novo';

const numero = (texto: string) => {
  const limpo = texto.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  return limpo === '' ? null : Number(limpo);
};

/**
 * Agenda uma sessão: escolhe ou cadastra o cliente ali mesmo, e cria uma
 * tatuagem nova ou continua uma que ele já tem.
 */
@Component({
  selector: 'app-modal-agendar',
  templateUrl: './modal-agendar.html',
  styleUrl: './modal-agendar.css',
})
export class ModalAgendar implements AfterViewInit {
  private readonly agenda = inject(Agenda);
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  /** Dia já escolhido no calendário. */
  readonly data = input<string | null>(null);
  /** Cliente já escolhido, quando o modal abre pela ficha. */
  readonly clienteId = input<number | null>(null);
  readonly salvo = output<number>();
  readonly fechar = output<void>();

  protected readonly locais = LOCAIS_DO_CORPO;
  protected readonly duracoes = DURACOES;
  protected readonly duracaoEmTexto = duracaoEmTexto;
  protected readonly valorOuTraco = valorOuTraco;
  protected readonly dataPorExtenso = dataPorExtenso;
  protected readonly NOVA = NOVA;
  protected readonly NOVO = NOVO;
  protected readonly String = String;

  protected readonly clientes = signal<Cliente[]>([]);
  protected readonly escolhaCliente = signal<string>('');
  protected readonly tatuagensDoCliente = signal<Tatuagem[]>([]);
  protected readonly escolhaTatuagem = signal<string>(NOVA);
  protected readonly agendarSessao = signal(true);
  protected readonly dia = signal(hojeIso());
  protected readonly valorTotal = signal('');
  protected readonly valorSessao = signal('');
  private valorSessaoEditado = false;
  protected readonly fotos = signal<{ arquivo: File; url: string }[]>([]);
  protected readonly erro = signal('');
  protected readonly ocupado = signal(false);

  protected readonly novoCliente = computed(() => this.escolhaCliente() === NOVO);
  protected readonly novaTatuagem = computed(() => this.escolhaTatuagem() === NOVA);
  protected readonly tatuagemEscolhida = computed(() =>
    this.tatuagensDoCliente().find((t) => String(t.id) === this.escolhaTatuagem()),
  );
  protected readonly restante = computed(() => {
    const t = this.tatuagemEscolhida();
    return t?.valorTotal != null ? Math.max(0, Number(t.valorTotal) - Number(t.totalPago)) : null;
  });

  async ngAfterViewInit() {
    this.dialogo().nativeElement.showModal();
    if (this.data()) this.dia.set(this.data()!);
    try {
      const clientes = await this.agenda.clientes();
      this.clientes.set(clientes);
      const inicial = this.clienteId();
      if (inicial) await this.trocarCliente(String(inicial));
      else if (!clientes.length) this.escolhaCliente.set(NOVO);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }

  protected async trocarCliente(valor: string) {
    this.escolhaCliente.set(valor);
    this.escolhaTatuagem.set(NOVA);
    this.tatuagensDoCliente.set([]);
    if (!valor || valor === NOVO) return;
    try {
      const ficha = await this.agenda.ficha(Number(valor));
      this.tatuagensDoCliente.set(ficha.tatuagens);
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    }
  }

  protected trocarTatuagem(valor: string) {
    this.escolhaTatuagem.set(valor);
    if (!this.valorSessaoEditado) {
      const restante = this.restante();
      this.valorSessao.set(valor === NOVA ? this.valorTotal() : restante ? String(restante) : '');
    }
  }

  protected digitarTotal(valor: string) {
    this.valorTotal.set(valor);
    if (!this.valorSessaoEditado) this.valorSessao.set(valor);
  }

  protected digitarValorSessao(valor: string) {
    this.valorSessaoEditado = true;
    this.valorSessao.set(valor);
  }

  protected escolherFotos(evento: Event) {
    const campo = evento.target as HTMLInputElement;
    const novas = [...(campo.files ?? [])]
      .filter((f) => f.type.startsWith('image/'))
      .map((arquivo) => ({ arquivo, url: URL.createObjectURL(arquivo) }));
    this.fotos.update((atuais) => [...atuais, ...novas]);
    campo.value = '';
  }

  protected tirarFoto(indice: number) {
    this.fotos.update((atuais) => {
      URL.revokeObjectURL(atuais[indice].url);
      return atuais.filter((_, i) => i !== indice);
    });
  }

  protected resumoTatuagem(t: Tatuagem): string {
    const feitas = t.sessoes.filter((s) => s.status === 'REALIZADA').length;
    const total = t.sessoes.filter((s) => s.status !== 'CANCELADA').length;
    const valor = t.valorTotal != null ? ` · ${dinheiro(Number(t.valorTotal))}` : '';
    return `${t.descricao}${t.localCorpo ? ' (' + t.localCorpo + ')' : ''} · ${feitas} de ${total} sessões feitas${valor}`;
  }

  protected async enviar(evento: Event) {
    evento.preventDefault();
    const campos = new FormData(evento.target as HTMLFormElement);
    const texto = (nome: string) => String(campos.get(nome) ?? '').trim();
    this.ocupado.set(true);
    this.erro.set('');
    try {
      let clienteId = Number(this.escolhaCliente());
      if (this.novoCliente()) {
        const criado = await this.agenda.criarCliente({
          nome: texto('clienteNome'),
          telefone: texto('clienteTelefone'),
        });
        clienteId = criado.id;
        // Se algo falhar depois, o cliente novo já fica escolhido.
        this.clientes.update((l) => [...l, criado].sort((a, b) => a.nome.localeCompare(b.nome)));
        this.escolhaCliente.set(String(criado.id));
      }
      if (!clienteId) throw new Error('cliente');

      const sessao = this.agendarSessao()
        ? {
            data: this.dia(),
            hora: texto('hora'),
            duracaoMinutos: numero(texto('duracao')),
            valor: numero(this.valorSessao()),
          }
        : null;

      let tatuagemId: number;
      if (this.novaTatuagem()) {
        const criada = await this.agenda.criarTatuagem({
          clienteId,
          descricao: texto('descricao'),
          localCorpo: texto('localCorpo'),
          valorTotal: numero(this.valorTotal()),
          primeiraSessao: sessao,
        });
        tatuagemId = criada.id;
        for (const foto of this.fotos()) {
          const { blob, nome } = await reduzirImagem(foto.arquivo);
          await this.agenda.adicionarImagem(tatuagemId, blob, nome);
        }
      } else {
        tatuagemId = Number(this.escolhaTatuagem());
        if (sessao) await this.agenda.criarSessao({ ...sessao, tatuagemId });
      }
      this.salvo.emit(tatuagemId);
      this.dialogo().nativeElement.close();
    } catch (e) {
      this.erro.set(
        e instanceof Error && e.message === 'cliente' ? 'Escolha o cliente.' : mensagemDeErro(e),
      );
    } finally {
      this.ocupado.set(false);
    }
  }

  protected fecharPeloFundo(evento: MouseEvent) {
    if (evento.target === this.dialogo().nativeElement) this.dialogo().nativeElement.close();
  }
}
