import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Autenticacao } from './autenticacao';

export type StatusSessao = 'AGENDADA' | 'REALIZADA' | 'CANCELADA';

export interface ClienteDados {
  nome: string;
  telefone?: string | null;
  instagram?: string | null;
  observacoes?: string | null;
}

export interface Cliente extends ClienteDados {
  id: number;
  tatuagens: number;
  totalPago: number;
  ultimaSessao: string | null;
  ultimoContato: string | null;
  /** A última tatuagem foi há 6 meses ou mais e ninguém o procurou nesse tempo. */
  paraContatar: boolean;
}

/** Uma vez em que o estúdio procurou o cliente. */
export interface Contato {
  id: number;
  data: string;
  usuarioId: number | null;
  usuarioNome: string | null;
  observacao: string | null;
}

export interface Sessao {
  id: number;
  responsavelId: number | null;
  responsavelNome: string | null;
  data: string;
  hora: string;
  duracaoMinutos: number | null;
  valor: number | null;
  status: StatusSessao;
  observacao: string | null;
  /** O cliente confirmou que vem. Volta a falso se o dia ou o horário mudar. */
  confirmada: boolean;
}

export interface SessaoDados {
  tatuagemId?: number;
  responsavelId?: number | null;
  data: string;
  hora: string;
  duracaoMinutos?: number | null;
  valor?: number | null;
  status?: StatusSessao;
  observacao?: string | null;
}

/** Situação do sinal da tatuagem. O valor só vem para o responsável. */
export interface SinalResumo {
  valor: number | null;
  pago: boolean;
}

/** Uma linha da agenda, já com a tatuagem e o cliente. Sem permissão, os valores vêm vazios. */
export interface SessaoAgenda extends Sessao {
  tatuagemId: number;
  descricao: string;
  localCorpo: string | null;
  valorTotal: number | null;
  clienteId: number;
  clienteNome: string;
  clienteTelefone: string | null;
  numero: number;
  totalSessoes: number;
  imagemId: number | null;
  valoresVisiveis: boolean;
  sinal: SinalResumo | null;
}

export interface Pagamento {
  id: number;
  data: string;
  valor: number;
  forma: string | null;
  observacao: string | null;
  sinal: boolean;
  pago: boolean;
}

export interface PagamentoDados {
  tatuagemId: number;
  data: string;
  valor: number;
  forma?: string | null;
  observacao?: string | null;
  sinal?: boolean;
  pago?: boolean;
}

export interface Imagem {
  id: number;
  nome: string;
  tipo: string;
}

export interface TatuagemDados {
  clienteId: number;
  responsavelId?: number | null;
  descricao: string;
  localCorpo?: string | null;
  valorTotal?: number | null;
  primeiraSessao?: SessaoDados | null;
  /** Só na criação. */
  sinal?: number | null;
  sinalPago?: boolean;
}

export interface Tatuagem {
  id: number;
  clienteId: number;
  clienteNome: string;
  clienteTelefone: string | null;
  responsavelId: number | null;
  responsavelNome: string | null;
  /** Os valores e pagamentos são só do tatuador responsável. */
  valoresVisiveis: boolean;
  descricao: string;
  localCorpo: string | null;
  valorTotal: number | null;
  totalPago: number | null;
  sessoes: Sessao[];
  pagamentos: Pagamento[];
  imagens: Imagem[];
}

export interface Ficha {
  cliente: Cliente;
  tatuagens: Tatuagem[];
  contatos: Contato[];
}

/** Chamadas ao back. Toda alteração muda a versão, para as telas abertas recarregarem. */
@Injectable({ providedIn: 'root' })
export class Agenda {
  private readonly http = inject(HttpClient);
  private readonly autenticacao = inject(Autenticacao);

  readonly versao = signal(0);

  clientes() {
    return this.get<Cliente[]>('clientes');
  }
  ficha(id: number) {
    return this.get<Ficha>(`clientes/${id}`);
  }
  criarCliente(dados: ClienteDados) {
    return this.mudar(this.http.post<Cliente>('/api/clientes', dados));
  }
  alterarCliente(id: number, dados: ClienteDados) {
    return this.mudar(this.http.put<void>(`/api/clientes/${id}`, dados));
  }
  removerCliente(id: number) {
    return this.mudar(this.http.delete<void>(`/api/clientes/${id}`));
  }

  registrarContato(clienteId: number, observacao?: string | null) {
    return this.mudar(this.http.post<Contato>(`/api/clientes/${clienteId}/contatos`, { observacao }));
  }
  removerContato(id: number) {
    return this.mudar(this.http.delete<void>(`/api/contatos/${id}`));
  }

  tatuagem(id: number) {
    return this.get<Tatuagem>(`tatuagens/${id}`);
  }
  criarTatuagem(dados: TatuagemDados) {
    return this.mudar(this.http.post<Tatuagem>('/api/tatuagens', dados));
  }
  alterarTatuagem(id: number, dados: TatuagemDados) {
    return this.mudar(this.http.put<void>(`/api/tatuagens/${id}`, dados));
  }
  removerTatuagem(id: number) {
    return this.mudar(this.http.delete<void>(`/api/tatuagens/${id}`));
  }

  sessoes(inicio: string, fim: string, responsavel?: number | null) {
    const filtro = responsavel ? `&responsavel=${responsavel}` : '';
    return this.get<SessaoAgenda[]>(`sessoes?inicio=${inicio}&fim=${fim}${filtro}`);
  }
  proximas(aPartirDe: string, limite = 5, responsavel?: number | null) {
    const filtro = responsavel ? `&responsavel=${responsavel}` : '';
    return this.get<SessaoAgenda[]>(`sessoes/proximas?a-partir-de=${aPartirDe}&limite=${limite}${filtro}`);
  }
  criarSessao(dados: SessaoDados) {
    return this.mudar(this.http.post<Sessao>('/api/sessoes', dados));
  }
  alterarSessao(id: number, dados: SessaoDados) {
    return this.mudar(this.http.put<Sessao>(`/api/sessoes/${id}`, dados));
  }
  confirmarSessao(id: number, confirmada: boolean) {
    return this.mudar(this.http.put<Sessao>(`/api/sessoes/${id}/confirmacao`, { confirmada }));
  }
  removerSessao(id: number) {
    return this.mudar(this.http.delete<void>(`/api/sessoes/${id}`));
  }

  criarPagamento(dados: PagamentoDados) {
    return this.mudar(this.http.post<Pagamento>('/api/pagamentos', dados));
  }
  alterarPagamento(id: number, dados: PagamentoDados) {
    return this.mudar(this.http.put<Pagamento>(`/api/pagamentos/${id}`, dados));
  }
  removerPagamento(id: number) {
    return this.mudar(this.http.delete<void>(`/api/pagamentos/${id}`));
  }

  adicionarImagem(tatuagemId: number, arquivo: Blob, nome: string) {
    const corpo = new FormData();
    corpo.append('arquivo', arquivo, nome);
    return this.mudar(this.http.post<Imagem>(`/api/tatuagens/${tatuagemId}/imagens`, corpo));
  }
  removerImagem(id: number) {
    return this.mudar(this.http.delete<void>(`/api/imagens/${id}`));
  }

  /** Todas as alterações passam por aqui, para as telas recarregarem. */
  avisarMudanca() {
    this.versao.update((v) => v + 1);
  }

  /** A tag img não envia o cabeçalho de login, então o token vai no endereço. */
  urlDaImagem(id: number): string {
    return `/api/imagens/${id}?token=${encodeURIComponent(this.autenticacao.token() ?? '')}`;
  }

  private get<T>(caminho: string): Promise<T> {
    return firstValueFrom(this.http.get<T>(`/api/${caminho}`));
  }

  private async mudar<T>(pedido: import('rxjs').Observable<T>): Promise<T> {
    const resposta = await firstValueFrom(pedido);
    this.versao.update((v) => v + 1);
    return resposta;
  }
}

export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof HttpErrorResponse) {
    if (erro.error?.mensagem) return erro.error.mensagem;
    if (erro.status === 0) return 'Não foi possível falar com o servidor da agenda. Confira se ele está aberto.';
    return `O servidor respondeu com erro ${erro.status}. Tente de novo.`;
  }
  if (erro instanceof Error && erro.message) return erro.message;
  return 'Ocorreu um erro inesperado. Tente de novo.';
}
