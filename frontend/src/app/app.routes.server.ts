import { RenderMode, ServerRoute } from '@angular/ssr';

// As telas dependem da API e da data de hoje, então renderizam no navegador.
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];
