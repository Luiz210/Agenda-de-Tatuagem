export interface EstadoAtualizacao {
  fase: 'parado' | 'verificando' | 'baixando' | 'pronta' | 'atualizado' | 'erro' | 'indisponivel';
  versaoAtual: string;
  versao?: string;
  progresso?: number;
}

/** Recursos que só existem quando as telas rodam dentro do aplicativo instalado. */
export interface AgendaApp {
  modo: 'local' | 'cliente';
  abrirConexao(): void;
  lerAtualizacao(): Promise<EstadoAtualizacao>;
  buscarAtualizacao(): void;
  instalarAtualizacao(): void;
  ouvirAtualizacao(aoMudar: (estado: EstadoAtualizacao) => void): void;
}

export function agendaApp(): AgendaApp | null {
  return (globalThis as { agendaApp?: AgendaApp }).agendaApp ?? null;
}
