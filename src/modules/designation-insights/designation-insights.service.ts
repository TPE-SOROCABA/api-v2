import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { TransactionLogger } from 'src/infra/transaction.logger';
import { SuggestAssignmentDto } from './dto/suggest-assignment.dto';

const HISTORY_WINDOW_MONTHS = 12;
const RECENT_WEEKS_HIGH = 8; // trabalharam juntos/nesse ponto há menos de 2 meses
const RECENT_WEEKS_MED = 16; // ... há menos de 4 meses
const SUGGESTION_ATTEMPTS = 25;

type HistoryRow = { participantId: string; pointId: string; assignmentId: string; designationDate: Date };
type Stat = { count12m: number; lastAt: Date };
type Candidate = { id: string; profile: string; sex: string };

function monthsAgo(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function recencyPenalty(lastAt: Date): number {
  const weeks = (Date.now() - lastAt.getTime()) / (1000 * 60 * 60 * 24 * 7);
  if (weeks <= RECENT_WEEKS_HIGH) return 15;
  if (weeks <= RECENT_WEEKS_MED) return 5;
  return 0;
}

@Injectable()
export class DesignationInsightsService {
  private readonly logger = new TransactionLogger(DesignationInsightsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Busca todo o histórico de assignments (ponto + parceiros) desses
   * participantes, numa designação que não seja a atual (não faz sentido
   * comparar a designação da própria semana com ela mesma).
   */
  private async fetchHistory(participantIds: string[], excludeDesignationId: string): Promise<HistoryRow[]> {
    if (participantIds.length === 0) return [];
    return this.prisma.$queryRawUnsafe<HistoryRow[]>(
      `
      SELECT ap.participant_id AS "participantId", a.point_id AS "pointId", a.id AS "assignmentId", d.designation_date AS "designationDate"
      FROM assignments_participants ap
      JOIN assignments a ON a.id = ap.assignment_id
      JOIN designations d ON d.id = a.designations_id
      WHERE ap.participant_id = ANY($1::text[])
        AND a.designations_id != $2
      ORDER BY d.designation_date DESC
      `,
      participantIds,
      excludeDesignationId,
    );
  }

  /**
   * Agrega o histórico cru em dois mapas: por (participante, ponto) e por
   * dupla/trio (par de participantes que já trabalharam juntos num mesmo ponto).
   */
  private aggregate(rows: HistoryRow[]) {
    const byAssignment = new Map<string, { pointId: string; date: Date; participantIds: Set<string> }>();
    for (const row of rows) {
      let entry = byAssignment.get(row.assignmentId);
      if (!entry) {
        entry = { pointId: row.pointId, date: new Date(row.designationDate), participantIds: new Set() };
        byAssignment.set(row.assignmentId, entry);
      }
      entry.participantIds.add(row.participantId);
    }

    const since = monthsAgo(HISTORY_WINDOW_MONTHS);
    const pointStats = new Map<string, Stat>();
    const pairStats = new Map<string, Stat>();

    const bump = (map: Map<string, Stat>, key: string, date: Date) => {
      const prev = map.get(key);
      const isRecent = date >= since;
      if (!prev) {
        map.set(key, { count12m: isRecent ? 1 : 0, lastAt: date });
        return;
      }
      prev.count12m += isRecent ? 1 : 0;
      if (date > prev.lastAt) prev.lastAt = date;
    };

    for (const { pointId, date, participantIds } of byAssignment.values()) {
      const ids = [...participantIds];
      for (const id of ids) bump(pointStats, `${id}|${pointId}`, date);
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          bump(pairStats, pairKey(ids[i], ids[j]), date);
        }
      }
    }

    return { pointStats, pairStats };
  }

  /** Hints (não-bloqueantes) pra exibir na designação manual: dupla/trio + ponto de cada participante já designado. */
  async getInsights(designationId: string) {
    const designation = await this.prisma.designations.findUnique({
      where: { id: designationId },
      include: {
        assignments: {
          include: {
            point: { select: { id: true, name: true } },
            assignmentsParticipants: {
              include: { participant: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });

    if (!designation) {
      throw new NotFoundException({ success: false, error: 'Not found', message: 'Designação não encontrada' });
    }

    const candidateIds = [
      ...new Set(designation.assignments.flatMap((a) => a.assignmentsParticipants.map((ap) => ap.participantId))),
    ];

    const { pointStats, pairStats } = this.aggregate(await this.fetchHistory(candidateIds, designationId));

    const assignments = designation.assignments.map((a) => {
      const participants = a.assignmentsParticipants.map((ap) => ap.participant);
      const stat = (id: string) => pointStats.get(`${id}|${a.pointId}`);

      const pairs: { participantIds: [string, string]; names: [string, string]; countLast12m: number; lastAt: string }[] = [];
      for (let i = 0; i < participants.length; i++) {
        for (let j = i + 1; j < participants.length; j++) {
          const s = pairStats.get(pairKey(participants[i].id, participants[j].id));
          if (s && s.count12m > 0) {
            pairs.push({
              participantIds: [participants[i].id, participants[j].id],
              names: [participants[i].name, participants[j].name],
              countLast12m: s.count12m,
              lastAt: s.lastAt.toISOString(),
            });
          }
        }
      }

      return {
        pointId: a.pointId,
        pointName: a.point.name,
        participants: participants
          .map((p) => {
            const s = stat(p.id);
            return s && s.count12m > 0
              ? { id: p.id, name: p.name, pointCountLast12m: s.count12m, pointLastAt: s.lastAt.toISOString() }
              : null;
          })
          .filter((p): p is NonNullable<typeof p> => p !== null),
        pairs,
      };
    });

    return { assignments };
  }

  /**
   * Sugestão de designação automática considerando histórico (não bloqueia
   * grupos pequenos que vão repetir de qualquer jeito — só tenta minimizar e
   * sinaliza em `warnings` quando não deu pra evitar).
   */
  async suggestAssignment(designationId: string, dto: SuggestAssignmentDto) {
    const designation = await this.prisma.designations.findUnique({
      where: { id: designationId },
      include: { assignments: { include: { point: { select: { id: true, name: true } } } } },
    });

    if (!designation) {
      throw new NotFoundException({ success: false, error: 'Not found', message: 'Designação não encontrada' });
    }

    const points = designation.assignments
      .filter((a) => a.config_status)
      .map((a) => ({ pointId: a.pointId, pointName: a.point.name, min: a.config_min, max: a.config_max }));

    // Mesma regra da legacy: capitão/coordenador nunca é escalado pelo automático.
    const placeable: Candidate[] = dto.participants.filter((p) => p.profile !== 'CAPTAIN' && p.profile !== 'COORDINATOR');

    const { pointStats, pairStats } = this.aggregate(await this.fetchHistory(placeable.map((c) => c.id), designationId));

    const pointPenalty = (participantId: string, pointId: string): number => {
      const s = pointStats.get(`${participantId}|${pointId}`);
      if (!s || s.count12m === 0) return 0;
      return 10 * s.count12m + recencyPenalty(s.lastAt);
    };
    const pairPenalty = (a: string, b: string): number => {
      const s = pairStats.get(pairKey(a, b));
      if (!s || s.count12m === 0) return 0;
      return 15 * s.count12m + recencyPenalty(s.lastAt);
    };

    const shuffle = <T>(arr: T[]): T[] => {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    };

    type Attempt = { byPoint: Map<string, Candidate[]>; leftover: Candidate[]; totalPenalty: number; belowMin: number };

    const runAttempt = (): Attempt => {
      let pool = shuffle(placeable);
      const order = shuffle(points); // ordem aleatória, como a legacy
      const byPoint = new Map<string, Candidate[]>();
      let totalPenalty = 0;

      for (const point of order) {
        const target = Math.random() < 0.5 ? point.min : point.max;
        const selected: Candidate[] = [];

        while (selected.length < target) {
          const eligible = pool.filter((c) => {
            if (selected.length === 0) return true;
            if (selected.length === 1) return c.sex === selected[0].sex; // regra da legacy: 2º precisa ser do mesmo sexo
            return true;
          });
          if (eligible.length === 0) break;

          let best = eligible[0];
          let bestScore = Infinity;
          for (const c of eligible) {
            const score = pointPenalty(c.id, point.pointId) + selected.reduce((s, sel) => s + pairPenalty(c.id, sel.id), 0);
            if (score < bestScore) {
              bestScore = score;
              best = c;
            }
          }

          selected.push(best);
          totalPenalty += bestScore;
          pool = pool.filter((c) => c.id !== best.id);
        }

        byPoint.set(point.pointId, selected);
      }

      const belowMin = order.filter((point) => (byPoint.get(point.pointId)?.length ?? 0) < point.min).length;
      return { byPoint, leftover: pool, totalPenalty, belowMin };
    };

    let best: Attempt | null = null;
    for (let i = 0; i < SUGGESTION_ATTEMPTS; i++) {
      const attempt = runAttempt();
      if (!best || attempt.belowMin < best.belowMin || (attempt.belowMin === best.belowMin && attempt.totalPenalty < best.totalPenalty)) {
        best = attempt;
      }
    }

    if (!best) {
      return { assignments: [], unassignedParticipantIds: placeable.map((p) => p.id), warnings: [] };
    }

    const warnings: { pointId: string; pointName: string; type: 'repeat-pair' | 'repeat-point' | 'below-min'; participantIds: string[]; detail: string }[] = [];

    const assignments = points.map((point) => {
      const selected = best!.byPoint.get(point.pointId) ?? [];

      if (selected.length < point.min) {
        warnings.push({
          pointId: point.pointId,
          pointName: point.pointName,
          type: 'below-min',
          participantIds: selected.map((s) => s.id),
          detail: `${point.pointName}: ficou com ${selected.length} de ${point.min} necessários (poucos voluntários disponíveis).`,
        });
      }

      for (let i = 0; i < selected.length; i++) {
        const s = pointStats.get(`${selected[i].id}|${point.pointId}`);
        if (s && s.count12m > 0) {
          warnings.push({
            pointId: point.pointId,
            pointName: point.pointName,
            type: 'repeat-point',
            participantIds: [selected[i].id],
            detail: `Grupo pequeno: repetiu ${point.pointName} (trabalhou lá ${s.count12m}x no último ano).`,
          });
        }
        for (let j = i + 1; j < selected.length; j++) {
          const s2 = pairStats.get(pairKey(selected[i].id, selected[j].id));
          if (s2 && s2.count12m > 0) {
            warnings.push({
              pointId: point.pointId,
              pointName: point.pointName,
              type: 'repeat-pair',
              participantIds: [selected[i].id, selected[j].id],
              detail: `Grupo pequeno: repetiu a dupla em ${point.pointName} (trabalharam juntos ${s2.count12m}x no último ano).`,
            });
          }
        }
      }

      return { pointId: point.pointId, participantIds: selected.map((s) => s.id) };
    });

    this.logger.log(`Sugestão de designação ${designationId}: ${warnings.length} aviso(s) de repetição/abaixo-do-mínimo`);

    return { assignments, unassignedParticipantIds: best.leftover.map((p) => p.id), warnings };
  }
}
