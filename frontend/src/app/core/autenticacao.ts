import { HttpClient, HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, firstValueFrom, from, switchMap, throwError } from 'rxjs';

export type Perfil = 'ADMIN' | 'PADRAO';

export interface Conta {
  id: number;
  nome: string;
  nomeUsuario: string;
  email: string | null;
  perfil: Perfil;
  funcao: string | null;
  temPin: boolean;
  /** Só na identificação temporária do computador do estúdio. */
  expiraEm: string | null;
}

export interface DadosCadastro {
  nome: string;
  nomeUsuario: string;
  email: string;
  senha: string;
  convite?: string;
  pin?: string;
}

/**
 * estudio: a tela está no computador que roda o servidor. Ali ninguém faz login:
 * qualquer um consulta, e para alterar a pessoa digita o próprio código.
 */
export interface Estado {
  estudio: boolean;
  temContas: boolean;
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

/**
 * Em casa, a pessoa fica conectada até clicar em Sair. No computador do estúdio,
 * a identificação pelo código vale alguns minutos e não fica salva.
 */
@Injectable({ providedIn: 'root' })
export class Autenticacao {
  private readonly http = inject(HttpClient);
  private readonly sessao = signal<SessaoAberta | null>(null);
  private readonly estadoAtual = signal<Estado | null>(null);
  private readonly agora = signal(Date.now());
  private relogio: ReturnType<typeof setInterval> | null = null;
  private pedidoAberto: { resolver: (ok: boolean) => void; promessa: Promise<boolean> } | null = null;

  readonly conta = computed(() => this.sessao()?.conta ?? null);
  readonly token = computed(() => this.sessao()?.token ?? null);
  readonly estado = this.estadoAtual.asReadonly();
  readonly estudio = computed(() => this.estadoAtual()?.estudio ?? false);
  readonly admin = computed(() => this.conta()?.perfil === 'ADMIN');
  /** A tela de código está aberta, pedida por uma alteração ou pelo botão Identificar. */
  readonly pedindoCodigo = signal(false);
  /** Segundos que faltam para a identificação do estúdio expirar. */
  readonly segundosRestantes = computed(() => {
    const expira = this.conta()?.expiraEm;
    if (!expira) return null;
    return Math.max(0, Math.round((new Date(expira).getTime() - this.agora()) / 1000));
  });

  /** Chamado antes de as telas abrirem. */
  async iniciar() {
    try {
      this.estadoAtual.set(await firstValueFrom(this.http.get<Estado>('/api/auth/estado')));
    } catch {
      this.estadoAtual.set({ estudio: false, temContas: true });
    }
    if (!this.estudio()) this.sessao.set(lerSessao());
  }

  async entrar(identificador: string, senha: string) {
    this.guardar(
      await firstValueFrom(
        this.http.post<SessaoAberta>('/api/auth/entrar', { identificador, senha }),
      ),
    );
  }

  async entrarComCodigo(pin: string) {
    this.guardar(await firstValueFrom(this.http.post<SessaoAberta>('/api/auth/pin', { pin })));
  }

  async cadastrar(dados: DadosCadastro) {
    this.guardar(await firstValueFrom(this.http.post<SessaoAberta>('/api/auth/cadastrar', dados)));
    this.estadoAtual.update((e) => (e ? { ...e, temContas: true } : e));
  }

  async trocarCodigo(pin: string) {
    await firstValueFrom(this.http.put('/api/auth/conta/pin', { pin }));
    this.sessao.update((s) => (s ? { ...s, conta: { ...s.conta, temPin: true } } : s));
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
    this.pararRelogio();
    try {
      localStorage.removeItem(CHAVE);
    } catch {
      // Sem armazenamento, a sessão só dura até fechar.
    }
  }

  /**
   * Abre a tela do código e espera a pessoa se identificar. Vários pedidos ao
   * mesmo tempo esperam a mesma tela.
   */
  pedirCodigo(): Promise<boolean> {
    if (this.pedidoAberto) return this.pedidoAberto.promessa;
    let resolver!: (ok: boolean) => void;
    const promessa = new Promise<boolean>((r) => (resolver = r));
    this.pedidoAberto = { resolver, promessa };
    this.pedindoCodigo.set(true);
    return promessa;
  }

  /** A tela do código fechou: com a pessoa identificada ou cancelada. */
  concluirPedido(ok: boolean) {
    this.pedindoCodigo.set(false);
    this.pedidoAberto?.resolver(ok);
    this.pedidoAberto = null;
  }

  private guardar(sessao: SessaoAberta) {
    this.sessao.set(sessao);
    if (sessao.conta.expiraEm) {
      this.iniciarRelogio();
      return;
    }
    try {
      localStorage.setItem(CHAVE, JSON.stringify(sessao));
    } catch {
      // Sem armazenamento, a sessão só dura até fechar.
    }
  }

  /** Atualiza a contagem e encerra a identificação quando o tempo acaba. */
  private iniciarRelogio() {
    this.pararRelogio();
    this.agora.set(Date.now());
    this.relogio = setInterval(() => {
      this.agora.set(Date.now());
      if (this.segundosRestantes() === 0) this.encerrarLocalmente();
    }, 1000);
  }

  private pararRelogio() {
    if (this.relogio) clearInterval(this.relogio);
    this.relogio = null;
  }
}

export const exigeLogin: CanActivateFn = () => {
  const autenticacao = inject(Autenticacao);
  const estado = autenticacao.estado();
  // No estúdio as telas abrem sem login, depois que a primeira conta existir.
  if (estado?.estudio) return estado.temContas || inject(Router).createUrlTree(['/entrar']);
  return autenticacao.conta() !== null || inject(Router).createUrlTree(['/entrar']);
};

export const soSemLogin: CanActivateFn = () => {
  const autenticacao = inject(Autenticacao);
  const estado = autenticacao.estado();
  if (estado?.estudio) return !estado.temContas || inject(Router).createUrlTree(['/']);
  return autenticacao.conta() === null || inject(Router).createUrlTree(['/']);
};

const CONSULTA = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Envia o token em toda chamada. Em casa, volta ao login se a sessão não valer
 * mais. No estúdio, pede o código antes de qualquer alteração e repete o pedido
 * depois que a pessoa se identifica.
 */
export const interceptadorDeSessao: HttpInterceptorFn = (pedido, proximo) => {
  const autenticacao = inject(Autenticacao);
  const router = inject(Router);
  const comToken = (p: HttpRequest<unknown>) => {
    const token = autenticacao.token();
    return token ? p.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : p;
  };
  const doLogin = pedido.url.startsWith('/api/auth/');
  const alteracao = !CONSULTA.has(pedido.method) && !doLogin;

  const repetirComCodigo = () =>
    from(autenticacao.pedirCodigo()).pipe(
      switchMap((ok) =>
        ok
          ? proximo(comToken(pedido))
          : throwError(() => new HttpErrorResponse({ status: 401, error: { mensagem: 'Alteração cancelada: ninguém se identificou.' } })),
      ),
    );

  if (autenticacao.estudio() && alteracao && !autenticacao.token()) {
    return repetirComCodigo();
  }

  const tokenUsado = autenticacao.token();
  return proximo(comToken(pedido)).pipe(
    catchError((erro: HttpErrorResponse) => {
      if (erro.status === 401 && autenticacao.estudio() && erro.error?.codigo === 'PIN') {
        // A identificação expirou entre o clique e o envio.
        autenticacao.encerrarLocalmente();
        return repetirComCodigo();
      }
      if (erro.status === 401 && tokenUsado && !doLogin && !autenticacao.estudio()) {
        autenticacao.encerrarLocalmente();
        void router.navigate(['/entrar']);
      }
      return throwError(() => erro);
    }),
  );
};
