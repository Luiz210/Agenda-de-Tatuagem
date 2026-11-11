import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Agenda } from './agenda';
import { Perfil } from './autenticacao';

/** O que todos veem de cada pessoa do estúdio, para escolher o responsável. */
export interface Pessoa {
  id: number;
  nome: string;
  funcao: string | null;
}

export interface Colaborador {
  id: number;
  nome: string;
  funcao: string | null;
  telefone: string | null;
  /** Só vem para administradores. */
  valorAluguel: number | null;
  diaPagamentoAluguel: number | null;
  perfil: Perfil;
  nomeUsuario: string;
  email: string | null;
  temPin: boolean;
}

export interface ColaboradorDados {
  nome: string;
  funcao?: string | null;
  telefone?: string | null;
  valorAluguel?: number | null;
  diaPagamentoAluguel?: number | null;
  perfil: Perfil;
  nomeUsuario: string;
  email?: string | null;
  /** Na edição, vazio mantém a atual. */
  senha?: string | null;
  pin?: string | null;
}

export type Acao = 'INCLUSAO' | 'ALTERACAO' | 'EXCLUSAO';

export interface RegistroAuditoria {
  id: number;
  dataHora: string;
  usuarioId: number;
  usuarioNome: string | null;
  origem: 'ESTUDIO' | 'REMOTO';
  acao: Acao;
  entidade: string;
  registroId: number | null;
  detalhes: string | null;
}

export interface FiltroAuditoria {
  entidade?: string;
  usuarioId?: number | null;
  inicio?: string;
  fim?: string;
  pagina?: number;
}

/** Nomes das tabelas como aparecem no histórico. */
export const ENTIDADES: Record<string, string> = {
  Cliente: 'Cliente',
  Tatuagem: 'Tatuagem',
  SessaoTatuagem: 'Sessão',
  Pagamento: 'Pagamento',
  Imagem: 'Imagem',
  Usuario: 'Colaborador',
  ContatoCliente: 'Contato com cliente',
  ItemEstoque: 'Item de estoque',
  Movimento: 'Movimento de estoque',
  Arquivo: 'Arquivo',
};

@Injectable({ providedIn: 'root' })
export class Colaboradores {
  private readonly http = inject(HttpClient);
  private readonly agenda = inject(Agenda);

  /** Pessoas ativas, carregadas uma vez e recarregadas quando o cadastro muda. */
  readonly pessoas = signal<Pessoa[]>([]);

  async carregarPessoas() {
    try {
      this.pessoas.set(await firstValueFrom(this.http.get<Pessoa[]>('/api/auth/pessoas')));
    } catch {
      // Sem a lista, os campos de responsável ficam vazios até a próxima tentativa.
    }
  }

  listar() {
    return firstValueFrom(this.http.get<Colaborador[]>('/api/colaboradores'));
  }
  async criar(dados: ColaboradorDados) {
    const criado = await firstValueFrom(this.http.post<Colaborador>('/api/colaboradores', dados));
    await this.mudou();
    return criado;
  }
  async alterar(id: number, dados: ColaboradorDados) {
    const alterado = await firstValueFrom(this.http.put<Colaborador>(`/api/colaboradores/${id}`, dados));
    await this.mudou();
    return alterado;
  }
  async excluir(id: number) {
    await firstValueFrom(this.http.delete<void>(`/api/colaboradores/${id}`));
    await this.mudou();
  }

  historico(filtro: FiltroAuditoria) {
    const partes = Object.entries(filtro)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
    return firstValueFrom(this.http.get<RegistroAuditoria[]>(`/api/auditoria?${partes.join('&')}`));
  }

  private async mudou() {
    this.agenda.avisarMudanca();
    await this.carregarPessoas();
  }
}
