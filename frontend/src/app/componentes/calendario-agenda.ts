import { Component, computed, input, output } from '@angular/core';
import { SessaoAgenda } from '../core/agenda';
import { dataDe, dataPorExtenso, semanasDoMes } from '../core/datas';
import { horaCurta } from '../core/formatos';

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const VISIVEIS = 2;

/** Mês inteiro, com os horários e clientes de cada dia. */
@Component({
  selector: 'app-calendario-agenda',
  templateUrl: './calendario-agenda.html',
  styleUrl: './calendario-agenda.css',
})
export class CalendarioAgenda {
  readonly ano = input.required<number>();
  readonly mes = input.required<number>();
  readonly hoje = input.required<string>();
  readonly selecionado = input<string | null>(null);
  readonly sessoes = input.required<SessaoAgenda[]>();
  readonly selecionar = output<string>();

  protected readonly diasSemana = DIAS_SEMANA;
  protected readonly visiveis = VISIVEIS;
  protected readonly horaCurta = horaCurta;
  protected readonly semanas = computed(() => semanasDoMes(this.ano(), this.mes()));
  protected readonly porDia = computed(() => {
    const mapa = new Map<string, SessaoAgenda[]>();
    for (const s of this.sessoes()) {
      if (s.status === 'CANCELADA') continue;
      mapa.set(s.data, [...(mapa.get(s.data) ?? []), s]);
    }
    return mapa;
  });

  protected diaNumero = (iso: string) => dataDe(iso).getDate();
  protected primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0];

  protected rotulo(iso: string): string {
    const n = this.porDia().get(iso)?.length ?? 0;
    const quantas = n === 0 ? 'sem sessões' : n === 1 ? '1 sessão' : `${n} sessões`;
    return `${dataPorExtenso(iso)}, ${quantas}`;
  }
}
