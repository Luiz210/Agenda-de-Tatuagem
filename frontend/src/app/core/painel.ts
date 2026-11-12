import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Categoria, Situacao } from './estoque';
import { Atraso, Compra, Conta } from './financeiro';

export interface ClienteSumido {
  id: number;
  nome: string;
  ultimaSessao: string;
}

export interface ItemAlerta {
  id: number;
  categoria: Categoria;
  nome: string;
  quantidade: number;
  limiar: number | null;
  unidade: string | null;
  situacao: Situacao;
}

export interface ProdutoVendido {
  id: number;
  nome: string;
  vendidos: number;
  /** Só para administradores. */
  faturamento: number | null;
}

export interface Resultado {
  recebidoDeColaboradores: number;
  vendaDeProdutos: number;
  gastosComContas: number;
  gastosComCompras: number;
  lucroLiquido: number;
  outrasEntradas: number;
}

export interface IndicadoresFinanceiros {
  resultado: Resultado;
  aReceberDeColaboradores: number;
  atrasados: Atraso[];
  contas: { total: number; pago: number; emAberto: number; quantidade: number; proxima: Conta | null; maisCara: Conta | null };
  compras: { total: number; quantidade: number; proximaParcela: Conta | null; maisCara: Compra | null };
}

export interface Painel {
  inicio: string;
  fim: string;
  totalParaContatar: number;
  paraContatar: ClienteSumido[];
  sessoesSemConfirmacao: number;
  alertas: ItemAlerta[];
  ranking: ProdutoVendido[];
  unidadesVendidas: number;
  /** Os campos em dinheiro vêm vazios para quem não é administrador. */
  faturamentoProdutos: number | null;
  financeiro: IndicadoresFinanceiros | null;
}

@Injectable({ providedIn: 'root' })
export class Paineis {
  private readonly http = inject(HttpClient);

  carregar(inicio: string, fim: string) {
    return firstValueFrom(this.http.get<Painel>(`/api/painel?inicio=${inicio}&fim=${fim}`));
  }
}
