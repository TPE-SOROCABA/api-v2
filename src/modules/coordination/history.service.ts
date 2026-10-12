import { Injectable, NotFoundException } from '@nestjs/common';
import { GroupType } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';

/**
 * Histórico e rotatividade de voluntários.
 *
 * O sistema NÃO guarda data de entrada/saída em grupo (`participants_groups` é só o estado atual), então
 * o "por onde a pessoa passou" é ESTIMADO pelas designações em que ela trabalhou (`assignments_participants`
 * → `assignments` → `designations`, que têm data e grupo). Isso vale retroativamente. Já as entradas/saídas/
 * trocas EXATAS só existem a partir do dia em que a auditoria (`audit_logs`) começou a gravar.
 */

/** Um grupo em que a pessoa trabalhou parou de aparecer há mais que isso enquanto ela seguia trabalhando em outro = saída estimada. */
const DEPARTURE_GAP_DAYS = 45;
/** Faltas por dia trabalhado acima disso × a média geral (com pelo menos uma saída estimada) = "atenção". */
const ATTENTION_FACTOR = 1.25;
const DAY_MS = 86_400_000;

export interface WorkedGroup {
  groupId: string;
  name: string;
  type: GroupType;
  firstAt: Date;
  lastAt: Date;
  /** designações (dias) em que trabalhou nesse grupo */
  designations: number;
  faltas: number;
}

interface WorkedRow {
  participantId: string;
  groupId: string;
  groupName: string;
  groupType: GroupType;
  firstAt: Date;
  lastAt: Date;
  designations: number;
}

interface FaltasRow {
  participantId: string;
  groupId: string;
  faltas: number;
}

function sinceDate(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

/** Saídas estimadas: grupos em que a pessoa parou de trabalhar enquanto continuou ativa em outro. */
function countDepartures(worked: { lastAt: Date }[]): number {
  if (worked.length < 2) return 0;
  const newest = Math.max(...worked.map((w) => w.lastAt.getTime()));
  return worked.filter((w) => w.lastAt.getTime() < newest - DEPARTURE_GAP_DAYS * DAY_MS).length;
}

@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Dias em que a pessoa esteve envolvida: designações em que estava ESCALADA (assignments_participants)
   * ou em que FALTOU (incident_histories, semana obrigatória). A união é a base mais justa: nos dados reais
   * ~17% das faltas já não têm a pessoa escalada naquela designação, e só contar escaladas inflaria a taxa.
   */
  private loadWorked(since: Date, participantIds?: string[]) {
    return this.prisma.$queryRawUnsafe<WorkedRow[]>(
      `
      WITH involved AS (
        SELECT ap.participant_id, d.id AS designation_id, d.group_id, d.designation_date
        FROM assignments_participants ap
        JOIN assignments a ON a.id = ap.assignment_id
        JOIN designations d ON d.id = a.designations_id
        WHERE d.designation_date >= $1::timestamp AND d.status <> 'CANCELLED'
          AND ($2::text[] IS NULL OR ap.participant_id = ANY($2::text[]))
        UNION
        SELECT ih.participant_id, d.id, d.group_id, d.designation_date
        FROM incident_histories ih
        JOIN designations d ON d.id = ih.designation_id
        WHERE d.mandatory_presence = true AND d.status <> 'CANCELLED' AND d.designation_date >= $1::timestamp
          AND ($2::text[] IS NULL OR ih.participant_id = ANY($2::text[]))
      )
      SELECT i.participant_id AS "participantId", i.group_id AS "groupId", g.name AS "groupName", g.type::text AS "groupType",
        MIN(i.designation_date) AS "firstAt", MAX(i.designation_date) AS "lastAt", COUNT(*)::int AS "designations"
      FROM involved i
      JOIN groups g ON g.id = i.group_id
      GROUP BY i.participant_id, i.group_id, g.name, g.type
      `,
      since,
      participantIds ?? null,
    );
  }

  // mesma regra do Painel de Faltas: semana com presença opcional não conta
  private loadFaltas(since: Date, participantIds?: string[]) {
    return this.prisma.$queryRawUnsafe<FaltasRow[]>(
      `
      SELECT ih.participant_id AS "participantId", d.group_id AS "groupId", COUNT(*)::int AS "faltas"
      FROM incident_histories ih
      JOIN designations d ON d.id = ih.designation_id
      WHERE d.mandatory_presence = true
        AND d.designation_date >= $1::timestamp
        AND ($2::text[] IS NULL OR ih.participant_id = ANY($2::text[]))
      GROUP BY ih.participant_id, d.group_id
      `,
      since,
      participantIds ?? null,
    );
  }

  /** Faltas por dia trabalhado de TODOS os voluntários no período: o "normal" pra comparar cada pessoa. */
  private async baseline(since: Date) {
    const [worked, faltas] = await Promise.all([
      this.prisma.$queryRawUnsafe<{ n: number }[]>(
        `
        SELECT COUNT(*)::int AS "n" FROM (
          SELECT ap.participant_id, d.id FROM assignments_participants ap
          JOIN assignments a ON a.id = ap.assignment_id JOIN designations d ON d.id = a.designations_id
          WHERE d.designation_date >= $1::timestamp AND d.status <> 'CANCELLED'
          UNION
          SELECT ih.participant_id, d.id FROM incident_histories ih JOIN designations d ON d.id = ih.designation_id
          WHERE d.mandatory_presence = true AND d.status <> 'CANCELLED' AND d.designation_date >= $1::timestamp
        ) involved
        `,
        since,
      ),
      this.prisma.$queryRawUnsafe<{ n: number }[]>(
        `
        SELECT COUNT(*)::int AS "n" FROM incident_histories ih JOIN designations d ON d.id = ih.designation_id
        WHERE d.mandatory_presence = true AND d.designation_date >= $1::timestamp
        `,
        since,
      ),
    ]);
    const days = Number(worked[0]?.n ?? 0);
    return { days, faltas: Number(faltas[0]?.n ?? 0), perDay: days > 0 ? Number(faltas[0]?.n ?? 0) / days : 0 };
  }

  private toWorkedGroups(rows: WorkedRow[], faltas: FaltasRow[]): WorkedGroup[] {
    return rows
      .map((r) => ({
        groupId: r.groupId,
        name: r.groupName,
        type: r.groupType,
        firstAt: new Date(r.firstAt),
        lastAt: new Date(r.lastAt),
        designations: Number(r.designations),
        faltas: Number(faltas.find((f) => f.groupId === r.groupId)?.faltas ?? 0),
      }))
      .sort((a, b) => a.firstAt.getTime() - b.firstAt.getTime());
  }

  /** Histórico de UMA pessoa: linha do tempo de ações + por onde trabalhou + faltas. */
  async person(id: string, months: number) {
    const participant = await this.prisma.participants.findUnique({
      where: { id },
      select: { id: true, name: true, participantsGroup: { select: { profile: true, group: { select: { id: true, name: true, type: true } } } } },
    });
    if (!participant) throw new NotFoundException('Voluntário não encontrado');

    const since = sinceDate(months);
    const [workedRows, faltasRows, events, firstAudit, base] = await Promise.all([
      this.loadWorked(since, [id]),
      this.loadFaltas(since, [id]),
      this.prisma.auditLogs.findMany({ where: { entity: 'participant', entityId: id }, orderBy: { createdAt: 'desc' }, take: 200 }).catch(() => []),
      this.prisma.auditLogs.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }).catch(() => null),
      this.baseline(since),
    ]);

    const groupsWorked = this.toWorkedGroups(workedRows, faltasRows);
    const designations = groupsWorked.reduce((s, g) => s + g.designations, 0);
    const faltas = faltasRows.reduce((s, f) => s + Number(f.faltas), 0);

    return {
      participant: { id: participant.id, name: participant.name },
      periodMonths: months,
      currentGroups: participant.participantsGroup.map((pg) => ({ groupId: pg.group.id, name: pg.group.name, type: pg.group.type, role: pg.profile })),
      // por onde trabalhou (estimado pelas designações; vale retroativamente)
      groupsWorked,
      distinctGroups: groupsWorked.length,
      estimatedDepartures: countDepartures(groupsWorked),
      faltas: {
        total: faltas,
        daysWorked: designations,
        perDay: designations > 0 ? faltas / designations : null,
        baselinePerDay: base.perDay,
      },
      // ações exatas (entrou, saiu, trocou, pediu troca, perfil, treinamento...) desde que a auditoria existe
      events: events.map((e) => ({ id: e.id, at: e.createdAt, action: e.action, actorName: e.actorName, metadata: e.metadata })),
      eventsSince: firstAudit?.createdAt ?? null,
    };
  }

  /**
   * Rotatividade: quem passou por mais de um grupo no período, com saídas estimadas, trocas exatas
   * registradas e faltas — pra enxergar "quem fica trocando de grupo e faltando demais".
   */
  async turnover(months: number, minGroups: number) {
    const since = sinceDate(months);
    const [workedRows, faltasRows, base] = await Promise.all([this.loadWorked(since), this.loadFaltas(since), this.baseline(since)]);

    const byPerson = new Map<string, WorkedRow[]>();
    for (const r of workedRows) {
      const list = byPerson.get(r.participantId) ?? [];
      list.push(r);
      byPerson.set(r.participantId, list);
    }
    const candidates = [...byPerson.entries()].filter(([, rows]) => rows.length >= minGroups).map(([pid]) => pid);
    if (candidates.length === 0) {
      return { periodMonths: months, baselinePerDay: base.perDay, attentionFactor: ATTENTION_FACTOR, items: [] };
    }

    const [people, transfers] = await Promise.all([
      this.prisma.participants.findMany({
        where: { id: { in: candidates } },
        select: { id: true, name: true, participantsGroup: { select: { group: { select: { name: true } } } } },
      }),
      // trocas/entradas/saídas EXATAS registradas na auditoria no período (só existem desde que a auditoria começou)
      this.prisma.auditLogs
        .groupBy({
          by: ['entityId'],
          where: { entity: 'participant', entityId: { in: candidates }, action: { in: ['GROUP_JOIN', 'GROUP_LEAVE', 'GROUP_TRANSFER'] }, createdAt: { gte: since } },
          _count: { _all: true },
        })
        .catch(() => []),
    ]);
    const nameOf = new Map(people.map((p) => [p.id, p]));
    const exact = new Map<string, number>();
    for (const t of transfers as { entityId: string | null; _count: { _all: number } }[]) {
      if (t.entityId) exact.set(t.entityId, t._count._all);
    }

    const items = candidates
      .map((pid) => {
        const rows = byPerson.get(pid)!;
        const mine = faltasRows.filter((f) => f.participantId === pid);
        const groupsWorked = this.toWorkedGroups(rows, mine);
        const designations = groupsWorked.reduce((s, g) => s + g.designations, 0);
        const faltas = mine.reduce((s, f) => s + Number(f.faltas), 0);
        const perDay = designations > 0 ? faltas / designations : null;
        const departures = countDepartures(groupsWorked);
        const p = nameOf.get(pid);
        return {
          participantId: pid,
          name: p?.name ?? '(removido)',
          currentGroups: p?.participantsGroup.map((pg) => pg.group.name) ?? [],
          groupsWorked,
          distinctGroups: groupsWorked.length,
          estimatedDepartures: departures,
          registeredMoves: exact.get(pid) ?? 0,
          faltas,
          daysWorked: designations,
          faltasPerDay: perDay,
          // trocou de grupo E falta acima do normal geral
          attention: departures >= 1 && perDay !== null && base.perDay > 0 && perDay >= base.perDay * ATTENTION_FACTOR,
        };
      })
      .sort((a, b) => Number(b.attention) - Number(a.attention) || b.estimatedDepartures - a.estimatedDepartures || (b.faltasPerDay ?? 0) - (a.faltasPerDay ?? 0));

    return { periodMonths: months, baselinePerDay: base.perDay, attentionFactor: ATTENTION_FACTOR, items };
  }
}
