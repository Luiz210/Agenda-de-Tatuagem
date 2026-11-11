import { Component, computed, effect, inject, signal } from '@angular/core';
import { mensagemDeErro } from '../core/agenda';
import { Autenticacao } from '../core/autenticacao';
import { Colaboradores, ENTIDADES, FiltroAuditoria, RegistroAuditoria } from '../core/colaboradores';
import { hojeIso, somarDias } from '../core/datas';

const ACOES = { INCLUSAO: 'Incluiu', ALTERACAO: 'Alterou', EXCLUSAO: 'Excluiu' };
const POR_PAGINA = 100;

/** Quem fez cada alteração nos dados do estúdio. Só administradores consultam. */
@Component({
  selector: 'app-pagina-historico',
  templateUrl: './historico.html',
  styleUrl: './historico.css',
})
export class PaginaHistorico {
  protected readonly autenticacao = inject(Autenticacao);
  protected readonly colaboradores = inject(Colaboradores);

  protected readonly registros = signal<RegistroAuditoria[]>([]);
  protected readonly erro = signal('');
  protected readonly carregando = signal(false);
  protected readonly temMais = signal(false);
  protected readonly entidade = signal('');
  protected readonly usuarioId = signal('');
  protected readonly inicio = signal(somarDias(hojeIso(), -30));
  protected readonly fim = signal(hojeIso());
  private pagina = 0;

  protected readonly entidades = Object.entries(ENTIDADES);
  protected readonly acoes = ACOES;
  protected readonly nomeDaEntidade = (e: string) => ENTIDADES[e] ?? e;
  protected readonly podeVer = computed(() => this.autenticacao.admin());

  constructor() {
    effect(() => {
      // Recarrega quando muda o filtro ou quem está identificado.
      this.entidade();
      this.usuarioId();
      this.inicio();
      this.fim();
      if (this.podeVer()) void this.carregar(false);
    });
  }

  protected async carregar(mais: boolean) {
    this.pagina = mais ? this.pagina + 1 : 0;
    const filtro: FiltroAuditoria = {
      entidade: this.entidade(),
      usuarioId: this.usuarioId() ? Number(this.usuarioId()) : null,
      inicio: this.inicio(),
      fim: this.fim(),
      pagina: this.pagina,
    };
    this.carregando.set(true);
    try {
      const lista = await this.colaboradores.historico(filtro);
      this.registros.update((atuais) => (mais ? [...atuais, ...lista] : lista));
      this.temMais.set(lista.length === POR_PAGINA);
      this.erro.set('');
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.carregando.set(false);
    }
  }

  protected async identificar() {
    await this.autenticacao.pedirCodigo();
    if (!this.autenticacao.admin()) this.erro.set('Só um administrador pode ver o histórico.');
  }

  protected quando(r: RegistroAuditoria) {
    const d = new Date(r.dataHora);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
}
