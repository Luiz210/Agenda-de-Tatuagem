import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { Agenda } from './agenda';
import { Autenticacao } from './autenticacao';

export type SituacaoConta = 'PAGA' | 'ABERTA' | 'VENCIDA';
export type SituacaoAluguel = 'PAGO' | 'A_VENCER' | 'ATRASADO';
export type TipoLancamento = 'ENTRADA' | 'SAIDA';
export type OrigemLancamento = 'CONTA' | 'ALUGUEL' | 'VENDA' | 'AVULSO';

export interface ContaDados {
  nome: string;
  valor: number | null;
  vencimento: string;
  observacao?: string | null;
}

export interface Conta {
  id: number;
  nome: string;
  valor: number;
  vencimento: string;
  observacao: string | null;
  situacao: SituacaoConta;
  pagaEm: string | null;
  forma: string | null;
  fotoId: number | null;
  comprovanteId: number | null;
  /** Preenchidos quando a conta é parcela de uma compra. */
  compraId: number | null;
  parcela: number | null;
  totalParcelas: number | null;
}

export interface CompraDados {
  nome: string;
  valorTotal: number | null;
  vencimento: string;
  parcelas: number;
  observacao?: string | null;
}

export interface Compra {
  id: number;
  nome: string;
  valorTotal: number;
  vencimento: string;
  parcelas: number;
  valorParcela: number;
  observacao: string | null;
  comprovanteId: number | null;
  parcelasPagas: number;
  valorPago: number;
  proximoVencimento: string | null;
}

export interface CompraDetalhe {
  compra: Compra;
  parcelas: Conta[];
}

export interface AluguelMes {
  colaboradorId: number;
  colaboradorNome: string;
  valor: number;
  vencimento: string;
  situacao: SituacaoAluguel;
  pagamentoId: number | null;
  pagoEm: string | null;
  forma: string | null;
}

export interface Atraso {
  colaboradorId: number;
  colaboradorNome: string;
  meses: string[];
  total: number;
}

export interface Lancamento {
  id: number;
  tipo: TipoLancamento;
  origem: OrigemLancamento;
  descricao: string;
  valor: number;
  data: string;
  realizado: boolean;
  referenciaId: number | null;
}

export interface Resumo {
  saldo: number;
  entradasDoMes: number;
  saidasDoMes: number;
  aReceber: number;
  aPagar: number;
  proximasContas: Conta[];
  alugueisAtrasados: Atraso[];
  ultimosLancamentos: Lancamento[];
}

/** Data, forma e arquivo de uma baixa (conta paga ou aluguel recebido). */
export interface Baixa {
  data: string;
  forma: string;
  arquivo?: Blob | null;
  nomeArquivo?: string;
}

/** O financeiro do estúdio. Só administradores: para os outros, o servidor responde 403. */
@Injectable({ providedIn: 'root' })
export class Financeiro {
  private readonly http = inject(HttpClient);
  private readonly agenda = inject(Agenda);
  private readonly autenticacao = inject(Autenticacao);

  resumo() {
    return this.get<Resumo>('resumo');
  }

  contas(mes: string) {
    return this.get<Conta[]>(`contas?mes=${mes}`);
  }
  criarConta(dados: ContaDados) {
    return this.mudar(this.http.post<Conta>('/api/financeiro/contas', dados));
  }
  alterarConta(id: number, dados: ContaDados) {
    return this.mudar(this.http.put<Conta>(`/api/financeiro/contas/${id}`, dados));
  }
  excluirConta(id: number) {
    return this.mudar(this.http.delete<void>(`/api/financeiro/contas/${id}`));
  }
  trocarFoto(id: number, arquivo: Blob, nome: string) {
    return this.mudar(this.http.put<Conta>(`/api/financeiro/contas/${id}/foto`, this.formulario(arquivo, nome)));
  }
  trocarComprovante(id: number, arquivo: Blob, nome: string) {
    return this.mudar(
      this.http.put<Conta>(`/api/financeiro/contas/${id}/comprovante`, this.formulario(arquivo, nome)),
    );
  }
  pagarConta(id: number, baixa: Baixa) {
    const corpo = new FormData();
    corpo.append('data', baixa.data);
    corpo.append('forma', baixa.forma);
    if (baixa.arquivo) corpo.append('arquivo', baixa.arquivo, baixa.nomeArquivo ?? 'comprovante');
    return this.mudar(this.http.post<Conta>(`/api/financeiro/contas/${id}/pagamento`, corpo));
  }
  desfazerPagamento(id: number) {
    return this.mudar(this.http.delete<Conta>(`/api/financeiro/contas/${id}/pagamento`));
  }

  compras() {
    return this.get<Compra[]>('compras');
  }
  compra(id: number) {
    return this.get<CompraDetalhe>(`compras/${id}`);
  }
  criarCompra(dados: CompraDados) {
    return this.mudar(this.http.post<CompraDetalhe>('/api/financeiro/compras', dados));
  }
  alterarCompra(id: number, dados: CompraDados) {
    return this.mudar(this.http.put<CompraDetalhe>(`/api/financeiro/compras/${id}`, dados));
  }
  excluirCompra(id: number) {
    return this.mudar(this.http.delete<void>(`/api/financeiro/compras/${id}`));
  }
  trocarComprovanteDaCompra(id: number, arquivo: Blob, nome: string) {
    return this.mudar(
      this.http.put<Compra>(`/api/financeiro/compras/${id}/comprovante`, this.formulario(arquivo, nome)),
    );
  }

  alugueis(mes: string) {
    return this.get<AluguelMes[]>(`alugueis?mes=${mes}`);
  }
  receberAluguel(colaboradorId: number, mes: string, baixa: Baixa) {
    return this.mudar(
      this.http.post<AluguelMes>('/api/financeiro/alugueis', { colaboradorId, mes, data: baixa.data, forma: baixa.forma }),
    );
  }
  desfazerAluguel(pagamentoId: number) {
    return this.mudar(this.http.delete<void>(`/api/financeiro/alugueis/${pagamentoId}`));
  }

  lancamentos(mes: string) {
    return this.get<Lancamento[]>(`lancamentos?mes=${mes}`);
  }
  aReceber() {
    return this.get<Lancamento[]>('a-receber');
  }
  lancarEntrada(dados: { descricao: string; valor: number | null; data: string; recebido: boolean }) {
    return this.mudar(this.http.post<Lancamento>('/api/financeiro/entradas', dados));
  }
  receberEntrada(id: number, data: string) {
    return this.mudar(this.http.put<Lancamento>(`/api/financeiro/entradas/${id}/recebimento`, { data }));
  }
  removerEntrada(id: number) {
    return this.mudar(this.http.delete<void>(`/api/financeiro/entradas/${id}`));
  }

  /** A tag img e o link de download não enviam o cabeçalho de login: o token vai no endereço. */
  urlDoArquivo(id: number) {
    return `/api/arquivos/${id}?token=${encodeURIComponent(this.autenticacao.token() ?? '')}`;
  }

  private formulario(arquivo: Blob, nome: string) {
    const corpo = new FormData();
    corpo.append('arquivo', arquivo, nome);
    return corpo;
  }

  private get<T>(caminho: string): Promise<T> {
    return firstValueFrom(this.http.get<T>(`/api/financeiro/${caminho}`));
  }

  private async mudar<T>(pedido: Observable<T>): Promise<T> {
    const resposta = await firstValueFrom(pedido);
    this.agenda.avisarMudanca();
    return resposta;
  }
}

/** "2026-11-01" → "novembro de 2026". */
export function mesPorExtenso(mes: string): string {
  const [ano, m] = mes.split('-').map(Number);
  const nome = new Date(ano, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
  return `${nome} de ${ano}`;
}

/** Primeiro dia do mês, em ISO, somando meses. */
export function outroMes(mes: string, meses: number): string {
  const [ano, m] = mes.split('-').map(Number);
  const d = new Date(ano, m - 1 + meses, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
