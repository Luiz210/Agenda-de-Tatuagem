import { SessaoAgenda } from './agenda';
import { duracaoEmTexto, linkWhatsapp, mensagemDeConfirmacao, telefoneFormatado } from './formatos';

const sessao = (extra: Partial<SessaoAgenda> = {}): SessaoAgenda => ({
  id: 1, data: '2026-11-10', hora: '14:00:00', duracaoMinutos: 240, valor: 800, status: 'AGENDADA',
  observacao: null, tatuagemId: 1, descricao: 'Fechamento de braço', localCorpo: 'Braço direito',
  valorTotal: 2400, clienteId: 1, clienteNome: 'Ana Souza', clienteTelefone: '16991234567',
  numero: 1, totalSessoes: 3, imagemId: null, responsavelId: 1, responsavelNome: 'Rafa',
  valoresVisiveis: true, sinal: null, confirmada: false, ...extra,
});

describe('formatos', () => {
  it('formata telefone com DDD', () => {
    expect(telefoneFormatado('16991234567')).toBe('(16) 99123-4567');
    expect(telefoneFormatado('1633221100')).toBe('(16) 3322-1100');
  });

  it('monta o link do WhatsApp com o código do Brasil', () => {
    expect(linkWhatsapp('(16) 99123-4567', 'oi')).toBe('https://wa.me/5516991234567?text=oi');
    expect(linkWhatsapp(null)).toBeNull();
    expect(linkWhatsapp('123')).toBeNull();
  });

  it('escreve a confirmação com o primeiro nome, a sessão e o horário', () => {
    const texto = mensagemDeConfirmacao(sessao());
    expect(texto).toContain('Olá, Ana!');
    expect(texto).toContain('(sessão 1 de 3)');
    expect(texto).toContain('às 14:00');
    expect(texto).toContain('terça-feira, 10 de novembro');
    expect(mensagemDeConfirmacao(sessao({ totalSessoes: 1 }))).not.toContain('sessão 1 de');
  });

  it('mostra a duração em horas', () => {
    expect(duracaoEmTexto(240)).toBe('4h');
    expect(duracaoEmTexto(90)).toBe('1h30');
    expect(duracaoEmTexto(null)).toBe('');
  });
});

describe('reengajamento', () => {
  it('conta o tempo sem vir em meses completos', async () => {
    const { mesesDesde, tempoDesde } = await import('./datas');
    expect(mesesDesde('2026-05-11', '2026-11-11')).toBe(6);
    expect(mesesDesde('2026-05-12', '2026-11-11')).toBe(5);
    expect(tempoDesde('2025-09-01', '2026-11-11')).toBe('há 1 ano e 2 meses');
    expect(tempoDesde('2026-11-01', '2026-11-11')).toBe('há menos de um mês');
  });

  it('chama o cliente pelo primeiro nome', async () => {
    const { mensagemDeReengajamento } = await import('./formatos');
    expect(mensagemDeReengajamento('Ana Souza')).toMatch(/^Oi, Ana!/);
  });
});
