import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { Agenda } from './agenda';
import { Autenticacao } from './autenticacao';

export type Categoria = 'INSUMO' | 'PRODUTO';
export type TipoMovimento = 'ENTRADA' | 'BAIXA' | 'VENDA';
export type Situacao = 'OK' | 'PROXIMO' | 'ABAIXO';

export interface ItemDados {
  categoria: Categoria;
  nome: string;
  unidade?: string | null;
  /** Só na criação. Depois, a quantidade muda por movimentos. */
  quantidade?: number | null;
  limiar?: number | null;
  precoVenda?: number | null;
  observacao?: string | null;
}

export interface Item {
  id: number;
  categoria: Categoria;
  nome: string;
  unidade: string | null;
  quantidade: number;
  limiar: number | null;
  precoVenda: number | null;
  observacao: string | null;
  imagemId: number | null;
  situacao: Situacao;
  vendidos: number;
  /** Só para administradores. */
  faturamento: number | null;
}

export interface MovimentoDados {
  tipo: TipoMovimento;
  quantidade: number;
  valorUnitario?: number | null;
  forma?: string | null;
  observacao?: string | null;
}

export interface Movimento {
  id: number;
  tipo: TipoMovimento;
  quantidade: number;
  valorUnitario: number | null;
  valorTotal: number | null;
  forma: string | null;
  data: string;
  usuarioNome: string | null;
  observacao: string | null;
}

/** Textos de cada categoria, para as duas telas usarem o mesmo componente. */
export const TEXTOS: Record<Categoria, { titulo: string; singular: string; novo: string; saida: string }> = {
  INSUMO: { titulo: 'Estoque', singular: 'material', novo: '+ Novo material', saida: 'Dar baixa' },
  PRODUTO: { titulo: 'Produtos', singular: 'produto', novo: '+ Novo produto', saida: 'Vender' },
};

/** Material e produtos do estúdio. Toda alteração avisa as telas abertas, como a agenda. */
@Injectable({ providedIn: 'root' })
export class Estoque {
  private readonly http = inject(HttpClient);
  private readonly agenda = inject(Agenda);
  private readonly autenticacao = inject(Autenticacao);

  listar(categoria: Categoria) {
    return firstValueFrom(this.http.get<Item[]>(`/api/estoque?categoria=${categoria}`));
  }
  item(id: number) {
    return firstValueFrom(this.http.get<Item>(`/api/estoque/${id}`));
  }
  criar(dados: ItemDados) {
    return this.mudar(this.http.post<Item>('/api/estoque', dados));
  }
  alterar(id: number, dados: ItemDados) {
    return this.mudar(this.http.put<Item>(`/api/estoque/${id}`, dados));
  }
  excluir(id: number) {
    return this.mudar(this.http.delete<void>(`/api/estoque/${id}`));
  }
  trocarImagem(id: number, arquivo: Blob, nome: string) {
    const corpo = new FormData();
    corpo.append('arquivo', arquivo, nome);
    return this.mudar(this.http.put<Item>(`/api/estoque/${id}/imagem`, corpo));
  }
  removerImagem(id: number) {
    return this.mudar(this.http.delete<void>(`/api/estoque/${id}/imagem`));
  }
  movimentos(id: number) {
    return firstValueFrom(this.http.get<Movimento[]>(`/api/estoque/${id}/movimentos`));
  }
  movimentar(id: number, dados: MovimentoDados) {
    return this.mudar(this.http.post<Item>(`/api/estoque/${id}/movimentos`, dados));
  }
  estornar(movimentoId: number) {
    return this.mudar(this.http.delete<Item>(`/api/movimentos/${movimentoId}`));
  }

  /** A tag img não envia o cabeçalho de login, então o token vai no endereço. */
  urlDoArquivo(id: number) {
    return `/api/arquivos/${id}?token=${encodeURIComponent(this.autenticacao.token() ?? '')}`;
  }

  private async mudar<T>(pedido: Observable<T>): Promise<T> {
    const resposta = await firstValueFrom(pedido);
    this.agenda.avisarMudanca();
    return resposta;
  }
}
