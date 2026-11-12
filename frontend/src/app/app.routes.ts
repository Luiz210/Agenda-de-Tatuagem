import { Routes } from '@angular/router';
import { exigeLogin, soSemLogin } from './core/autenticacao';
import { PaginaAgenda } from './paginas/agenda';
import { Clientes } from './paginas/clientes';
import { PaginaColaboradores } from './paginas/colaboradores';
import { PaginaEstoque } from './paginas/estoque';
import { Entrar } from './paginas/entrar';
import { PaginaFinanceiro } from './paginas/financeiro';
import { FichaCliente } from './paginas/ficha-cliente';
import { PaginaHistorico } from './paginas/historico';
import { Home } from './paginas/home';

const NOME = 'Agenda de Tatuagem';

export const routes: Routes = [
  { path: 'entrar', component: Entrar, title: `Entrar | ${NOME}`, canActivate: [soSemLogin] },
  { path: '', component: Home, title: NOME, canActivate: [exigeLogin] },
  { path: 'painel', redirectTo: '' },
  { path: 'agenda', component: PaginaAgenda, title: `Agenda | ${NOME}`, canActivate: [exigeLogin] },
  { path: 'clientes', component: Clientes, title: `Clientes | ${NOME}`, canActivate: [exigeLogin] },
  { path: 'clientes/:id', component: FichaCliente, title: `Cliente | ${NOME}`, canActivate: [exigeLogin] },
  {
    path: 'estoque',
    component: PaginaEstoque,
    title: `Estoque | ${NOME}`,
    data: { categoria: 'INSUMO' },
    canActivate: [exigeLogin],
  },
  {
    path: 'produtos',
    component: PaginaEstoque,
    title: `Produtos | ${NOME}`,
    data: { categoria: 'PRODUTO' },
    canActivate: [exigeLogin],
  },
  { path: 'colaboradores', component: PaginaColaboradores, title: `Colaboradores | ${NOME}`, canActivate: [exigeLogin] },
  { path: 'financeiro', component: PaginaFinanceiro, title: `Financeiro | ${NOME}`, canActivate: [exigeLogin] },
  { path: 'historico', component: PaginaHistorico, title: `Histórico | ${NOME}`, canActivate: [exigeLogin] },
  { path: '**', redirectTo: '' },
];
