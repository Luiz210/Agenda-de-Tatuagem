import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, firstValueFrom, throwError } from 'rxjs';

export interface Conta {
  id: number;
  nome: string;
  nomeUsuario: string;
  email: string;
}

export interface DadosCadastro {
  nome: string;
  nomeUsuario: string;
  email: string;
  senha: string;
  convite?: string;
}

interface SessaoAberta {
  token: string;
  conta: Conta;
}

// Chave própria, para não misturar com a sessão do Rotina no mesmo computador.
const CHAVE = 'agenda-tatuagem.sessao.v1';

function lerSessao(): SessaoAberta | null {
  try {
    const salvo = localStorage.getItem(CHAVE);
    return salvo ? (JSON.parse(salvo) as SessaoAberta) : null;
  } catch {
    return null;
  }
}

/** Mantém a pessoa conectada entre aberturas, até ela clicar em Sair. */
@Injectable({ providedIn: 'root' })
export class Autenticacao {
  private readonly http = inject(HttpClient);
  private readonly sessao = signal<SessaoAberta | null>(lerSessao());

  readonly conta = computed(() => this.sessao()?.conta ?? null);
  readonly token = computed(() => this.sessao()?.token ?? null);

  async entrar(identificador: string, senha: string) {
    this.guardar(
      await firstValueFrom(
        this.http.post<SessaoAberta>('/api/auth/entrar', { identificador, senha }),
      ),
    );
  }

  async cadastrar(dados: DadosCadastro) {
    this.guardar(await firstValueFrom(this.http.post<SessaoAberta>('/api/auth/cadastrar', dados)));
  }

  async sair() {
    try {
      await firstValueFrom(this.http.post('/api/auth/sair', {}));
    } finally {
      this.encerrarLocalmente();
    }
  }

  encerrarLocalmente() {
    this.sessao.set(null);
    try {
      localStorage.removeItem(CHAVE);
    } catch {
      // Sem armazenamento, a sessão só dura até fechar.
    }
  }

  private guardar(sessao: SessaoAberta) {
    this.sessao.set(sessao);
    try {
      localStorage.setItem(CHAVE, JSON.stringify(sessao));
    } catch {
      // Sem armazenamento, a sessão só dura até fechar.
    }
  }
}

export const exigeLogin: CanActivateFn = () => {
  const conectado = inject(Autenticacao).conta() !== null;
  return conectado || inject(Router).createUrlTree(['/entrar']);
};

export const soSemLogin: CanActivateFn = () => {
  const conectado = inject(Autenticacao).conta() !== null;
  return !conectado || inject(Router).createUrlTree(['/']);
};

/** Envia o token em toda chamada e volta ao login se a sessão não valer mais. */
export const interceptadorDeSessao: HttpInterceptorFn = (pedido, proximo) => {
  const autenticacao = inject(Autenticacao);
  const router = inject(Router);
  const token = autenticacao.token();
  const comToken = token
    ? pedido.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : pedido;

  return proximo(comToken).pipe(
    catchError((erro: HttpErrorResponse) => {
      if (erro.status === 401 && token) {
        autenticacao.encerrarLocalmente();
        void router.navigate(['/entrar']);
      }
      return throwError(() => erro);
    }),
  );
};
