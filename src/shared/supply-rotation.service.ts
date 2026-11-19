import { BadRequestException, Injectable } from '@nestjs/common';
import { GroupType, Weekday } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';

export type SupplyTask = 'CAFE' | 'LIMPEZA';
export const SUPPLY_LABEL: Record<SupplyTask, string> = { CAFE: 'café', LIMPEZA: 'limpeza' };

/** Dias em que o rodízio anda (segunda a sábado, na ordem do quadro). */
export const SUPPLY_WEEKDAYS: Weekday[] = [Weekday.MONDAY, Weekday.TUESDAY, Weekday.WEDNESDAY, Weekday.THURSDAY, Weekday.FRIDAY, Weekday.SATURDAY];

/** Chave em `system_settings`: `supply:2026-11` = {"weekday":"WEDNESDAY","morning":"CAFE"} (tarde = o outro). */
export const supplyKey = (year: number, month: number) => `supply:${year}-${String(month).padStart(2, '0')}`;

export interface SupplyMonth {
  year: number;
  month: number;
  weekday: Weekday;
  /** o que o grupo da MANHÃ cuida nesse mês; o da tarde cuida do outro */
  morning: SupplyTask;
}

const other = (t: SupplyTask): SupplyTask => (t === 'CAFE' ? 'LIMPEZA' : 'CAFE');
const isMorning = (startHour: string) => startHour < '12:00';

/** Mês/ano de hoje no fuso de São Paulo (o servidor roda em UTC). */
export function brMonth(ref: Date = new Date()): { year: number; month: number } {
  const [y, m] = ref.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).split('-').map(Number);
  return { year: y, month: m };
}

/**
 * Rodízio de café e limpeza dos grupos do Centro (só MAIN). Por mês, UM dia da semana: o grupo da manhã
 * e o da tarde desse dia dividem café e limpeza durante o mês inteiro. Ao passar do sábado volta na
 * segunda e INVERTE (quem levou café passa a levar limpeza). Guardado em `system_settings`, sem tabela nova.
 */
@Injectable()
export class SupplyRotationService {
  constructor(private readonly prisma: PrismaService) {}

  private parse(key: string, value: string): SupplyMonth | null {
    const m = /^supply:(\d{4})-(\d{2})$/.exec(key);
    if (!m) return null;
    try {
      const v = JSON.parse(value);
      if (!SUPPLY_WEEKDAYS.includes(v.weekday) || (v.morning !== 'CAFE' && v.morning !== 'LIMPEZA')) return null;
      return { year: Number(m[1]), month: Number(m[2]), weekday: v.weekday, morning: v.morning };
    } catch {
      return null;
    }
  }

  async getMonth(year: number, month: number): Promise<SupplyMonth | null> {
    const row = await this.prisma.systemSettings.findUnique({ where: { key: supplyKey(year, month) } });
    return row ? this.parse(row.key, row.value) : null;
  }

  /** O que esse grupo cuida no mês de `ref` (null = nada: outro dia, outro tipo de grupo ou mês sem rodízio). */
  async dutyFor(group: { type: GroupType; configWeekday: Weekday; configStartHour: string }, ref: Date = new Date()): Promise<{ task: SupplyTask; label: string; year: number; month: number } | null> {
    if (group.type !== GroupType.MAIN) return null;
    const { year, month } = brMonth(ref);
    const cur = await this.getMonth(year, month);
    if (!cur || cur.weekday !== group.configWeekday) return null;
    const task = isMorning(group.configStartHour) ? cur.morning : other(cur.morning);
    return { task, label: SUPPLY_LABEL[task], year, month };
  }

  /** Frase da mensagem do WhatsApp ('' quando o grupo não cuida de nada neste mês). */
  async messageLine(group: { type: GroupType; configWeekday: Weekday; configStartHour: string }, ref?: Date): Promise<string> {
    const d = await this.dutyFor(group, ref);
    if (!d) return '';
    return d.task === 'CAFE' ? '☕ Neste mês, o grupo de vocês cuida do *café*.' : '🧹 Neste mês, o grupo de vocês cuida da *limpeza*.';
  }

  /** Os 12 meses do ano, com os grupos do Centro de cada dia. */
  async list(year: number) {
    const [rows, groups] = await Promise.all([
      this.prisma.systemSettings.findMany({ where: { key: { startsWith: `supply:${year}-` } } }),
      this.prisma.groups.findMany({ where: { type: GroupType.MAIN }, orderBy: { configStartHour: 'asc' }, select: { id: true, name: true, configWeekday: true, configStartHour: true, status: true } }),
    ]);
    const months = new Map(rows.map((r) => [r.key, this.parse(r.key, r.value)]));
    const groupsOf = (wd: Weekday) =>
      groups
        .filter((g) => g.configWeekday === wd)
        .map((g) => ({ groupId: g.id, name: g.name, startHour: g.configStartHour, period: isMorning(g.configStartHour) ? 'MORNING' : 'AFTERNOON' }));
    return {
      year,
      weekdaysWithGroups: SUPPLY_WEEKDAYS.filter((w) => groups.some((g) => g.configWeekday === w)),
      months: Array.from({ length: 12 }, (_, i) => {
        const m = months.get(supplyKey(year, i + 1)) ?? null;
        return {
          month: i + 1,
          weekday: m?.weekday ?? null,
          morning: m?.morning ?? null,
          afternoon: m ? other(m.morning) : null,
          groups: m ? groupsOf(m.weekday).map((g) => ({ ...g, task: g.period === 'MORNING' ? m.morning : other(m.morning) })) : [],
        };
      }),
    };
  }

  async set(year: number, month: number, weekday: Weekday, morning: SupplyTask) {
    if (!SUPPLY_WEEKDAYS.includes(weekday)) throw new BadRequestException('Escolha um dia de segunda a sábado');
    if (month < 1 || month > 12) throw new BadRequestException('Mês inválido');
    await this.prisma.systemSettings.upsert({
      where: { key: supplyKey(year, month) },
      create: { key: supplyKey(year, month), value: JSON.stringify({ weekday, morning }) },
      update: { value: JSON.stringify({ weekday, morning }) },
    });
  }

  async clear(year: number, month: number) {
    await this.prisma.systemSettings.deleteMany({ where: { key: supplyKey(year, month) } });
  }

  /**
   * Gera `count` meses seguidos a partir de (year, month) começando em `weekday` com `morning` na manhã.
   * A cada mês anda um dia (pula dia sem grupo do Centro); ao passar do último dia volta ao primeiro e inverte.
   */
  async generate(year: number, month: number, count: number, weekday: Weekday, morning: SupplyTask) {
    const groups = await this.prisma.groups.findMany({ where: { type: GroupType.MAIN }, select: { configWeekday: true } });
    const days = SUPPLY_WEEKDAYS.filter((w) => groups.some((g) => g.configWeekday === w));
    if (!days.length) throw new BadRequestException('Não há grupos do Centro cadastrados');
    let idx = days.indexOf(weekday);
    if (idx < 0) throw new BadRequestException('Esse dia não tem grupo do Centro');
    let task = morning;
    let y = year;
    let m = month;
    const made: SupplyMonth[] = [];
    for (let i = 0; i < count; i++) {
      await this.set(y, m, days[idx], task);
      made.push({ year: y, month: m, weekday: days[idx], morning: task });
      idx++;
      if (idx >= days.length) {
        idx = 0;
        task = other(task);
      }
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
    return made;
  }
}
