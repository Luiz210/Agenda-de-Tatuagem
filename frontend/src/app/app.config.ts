import {
  ApplicationConfig,
  PLATFORM_ID,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { Autenticacao, interceptadorDeSessao } from './core/autenticacao';
import { Colaboradores } from './core/colaboradores';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([interceptadorDeSessao])),
    // Antes de abrir as telas: saber se é o computador do estúdio e quem são as pessoas.
    provideAppInitializer(() => {
      // Na geração das páginas (SSR) não há servidor da agenda para consultar.
      if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
      const autenticacao = inject(Autenticacao);
      const colaboradores = inject(Colaboradores);
      return autenticacao.iniciar().then(() => void colaboradores.carregarPessoas());
    }),
  ],
};
