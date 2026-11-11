const pad = (n: number) => String(n).padStart(2, '0');

export const isoDe = (ano: number, mes: number, dia: number) =>
  `${ano}-${pad(mes + 1)}-${pad(dia)}`;

export function hojeIso(agora = new Date()): string {
  return isoDe(agora.getFullYear(), agora.getMonth(), agora.getDate());
}

/** Lê AAAA-MM-DD como data local (new Date('AAAA-MM-DD') seria UTC e voltaria um dia no Brasil). */
export function dataDe(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}

export function somarDias(iso: string, dias: number): string {
  const d = dataDe(iso);
  d.setDate(d.getDate() + dias);
  return hojeIso(d);
}

export const diasNoMes = (ano: number, mes: number) => new Date(ano, mes + 1, 0).getDate();

export function diasDoMes(ano: number, mes: number): string[] {
  return Array.from({ length: diasNoMes(ano, mes) }, (_, i) => isoDe(ano, mes, i + 1));
}

/** Semanas de domingo a sábado; null nas casas fora do mês. */
export function semanasDoMes(ano: number, mes: number): (string | null)[][] {
  const casas: (string | null)[] = [
    ...Array<null>(new Date(ano, mes, 1).getDay()).fill(null),
    ...diasDoMes(ano, mes),
  ];
  while (casas.length % 7) casas.push(null);
  const semanas: (string | null)[][] = [];
  for (let i = 0; i < casas.length; i += 7) semanas.push(casas.slice(i, i + 7));
  return semanas;
}

export function mudarMes(ano: number, mes: number, delta: number) {
  const d = new Date(ano, mes + delta, 1);
  return { ano: d.getFullYear(), mes: d.getMonth() };
}

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const nomeDoMes = (ano: number, mes: number) =>
  capitalizar(
    new Date(ano, mes, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
  );

export const dataPorExtenso = (iso: string) =>
  capitalizar(
    dataDe(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }),
  );

export const dataCurta = (iso: string) =>
  dataDe(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

export function duracao(segundos: number): string {
  const minutos = Math.floor(segundos / 60);
  const horas = Math.floor(minutos / 60);
  if (horas && minutos % 60) return `${horas}h ${minutos % 60}min`;
  if (horas) return `${horas}h`;
  return minutos ? `${minutos}min` : 'menos de 1min';
}

export const dinheiro = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function inicioEFimDoMes(ano: number, mes: number) {
  return { inicio: isoDe(ano, mes, 1), fim: isoDe(ano, mes, diasNoMes(ano, mes)) };
}

/** "qui., 12/11": cabe ao lado do horário. */
export const diaCurto = (iso: string) =>
  dataDe(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

/** Meses completos entre uma data (ISO) e hoje. */
export function mesesDesde(iso: string, hoje = hojeIso()): number {
  const [a1, m1, d1] = iso.slice(0, 10).split('-').map(Number);
  const [a2, m2, d2] = hoje.split('-').map(Number);
  return Math.max(0, (a2 - a1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0));
}

/** "há 7 meses", "há 1 ano e 2 meses". */
export function tempoDesde(iso: string, hoje = hojeIso()): string {
  const meses = mesesDesde(iso, hoje);
  if (meses < 1) return 'há menos de um mês';
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const partes = [];
  if (anos) partes.push(anos === 1 ? '1 ano' : `${anos} anos`);
  if (resto) partes.push(resto === 1 ? '1 mês' : `${resto} meses`);
  return 'há ' + partes.join(' e ');
}
