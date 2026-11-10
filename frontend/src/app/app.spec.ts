import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
  });

  async function criar() {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('sem login não mostra o menu lateral', async () => {
    expect((await criar()).querySelector('.lateral')).toBeNull();
  });

  it('com login mostra Hoje, Agenda e Clientes no menu lateral', async () => {
    localStorage.setItem(
      'agenda-tatuagem.sessao.v1',
      JSON.stringify({ token: 't', conta: { id: 1, nome: 'L', nomeUsuario: 'l', email: 'l@x.com' } }),
    );
    const links = [...(await criar()).querySelectorAll('.lateral a')].map((a) =>
      a.textContent?.trim(),
    );
    expect(links).toEqual(['Hoje', 'Agenda', 'Clientes']);
  });
});
