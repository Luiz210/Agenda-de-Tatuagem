import { dataPorExtenso, dinheiro } from './datas';
import { SessaoAgenda } from './agenda';

/** "16991234567" vira "(16) 99123-4567". */
export function telefoneFormatado(numeros: string | null | undefined): string {
  const n = (numeros ?? '').replace(/\D/g, '');
  const local = n.length > 11 ? n.slice(n.length - 11) : n;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return n;
}

/** "14:00:00" vira "14:00". */
export const horaCurta = (hora: string) => hora.slice(0, 5);

export function duracaoEmTexto(minutos: number | null | undefined): string {
  if (!minutos) return '';
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h && m) return `${h}h${String(m).padStart(2, '0')}`;
  return h ? `${h}h` : `${m}min`;
}

export const valorOuTraco = (v: number | null | undefined) => (v == null ? '—' : dinheiro(Number(v)));

/** Números com o código do Brasil, como o WhatsApp espera. */
export function numeroWhatsapp(telefone: string | null | undefined): string | null {
  const n = (telefone ?? '').replace(/\D/g, '');
  if (n.length === 10 || n.length === 11) return `55${n}`;
  if (n.length >= 12) return n;
  return null;
}

export function mensagemDeConfirmacao(s: SessaoAgenda): string {
  const primeiroNome = s.clienteNome.trim().split(/\s+/)[0];
  const dia = dataPorExtenso(s.data).toLowerCase();
  const partes = s.totalSessoes > 1 ? ` (sessão ${s.numero} de ${s.totalSessoes})` : '';
  return (
    `Olá, ${primeiroNome}! Passando para confirmar sua sessão de tatuagem${partes} ` +
    `na ${dia}, às ${horaCurta(s.hora)}.\n` +
    `Tatuagem: ${s.descricao}${s.localCorpo ? ` (${s.localCorpo})` : ''}.\n` +
    'Pode confirmar, por favor?'
  );
}

/** Link que abre a conversa no WhatsApp com a mensagem pronta; null sem telefone. */
export function linkWhatsapp(telefone: string | null | undefined, mensagem = ''): string | null {
  const numero = numeroWhatsapp(telefone);
  if (!numero) return null;
  const texto = mensagem ? `?text=${encodeURIComponent(mensagem)}` : '';
  return `https://wa.me/${numero}${texto}`;
}
