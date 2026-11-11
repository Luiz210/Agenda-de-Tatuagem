import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { Autenticacao, Estado } from './core/autenticacao';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
  });

  /** Sobe o app como a inicialização faz: primeiro pergunta ao servidor que computador é este. */
  async function criar(estado: Estado) {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const iniciando = TestBed.inject(Autenticacao).iniciar();
    TestBed.inject(HttpTestingController).expectOne('/api/auth/estado').flush(estado);
    await iniciando;
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const links = (tela: HTMLElement) =>
    [...tela.querySelectorAll('.lateral a')].map((a) => a.textContent?.trim());

  it('em outro computador, sem login, não mostra o menu lateral', async () => {
    expect((await criar({ estudio: false, temContas: true })).querySelector('.lateral')).toBeNull();
  });

  it('em outro computador, com login, mostra as telas do dia a dia', async () => {
    localStorage.setItem(
      'agenda-tatuagem.sessao.v1',
      JSON.stringify({ token: 't', conta: { id: 1, nome: 'L', nomeUsuario: 'l', perfil: 'PADRAO', expiraEm: null } }),
    );
    expect(links(await criar({ estudio: false, temContas: true }))).toEqual([
      'Hoje',
      'Agenda',
      'Clientes',
      'Colaboradores',
    ]);
  });

  it('no computador do estúdio abre sem login e oferece a identificação', async () => {
    const tela = await criar({ estudio: true, temContas: true });
    expect(links(tela)).toContain('Histórico');
    expect(tela.querySelector('.topo')?.textContent).toContain('Identificar-se');
  });
});
