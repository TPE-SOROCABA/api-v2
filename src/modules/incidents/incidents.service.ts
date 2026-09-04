import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { TransactionLogger } from 'src/infra/transaction.logger';

export interface IncidentsFilter {
  /** undefined = todos os grupos; array = restringe a esses grupos */
  groupIds?: string[];
  /** filtro "contém" no nome do participante */
  participantName?: string;
  /** filtro exato por participante (tem prioridade sobre participantName) */
  participantId?: string;
}

@Injectable()
export class IncidentsService {
  private readonly logger = new TransactionLogger(IncidentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(filter: IncidentsFilter): Prisma.IncidentHistoriesWhereInput {
    return {
      ...(filter.groupIds && {
        designation: { is: { groupId: { in: filter.groupIds } } },
      }),
      ...(filter.participantId
        ? { participantId: filter.participantId }
        : filter.participantName && {
            participant: {
              is: { name: { contains: filter.participantName, mode: 'insensitive' } },
            },
          }),
    };
  }

  /** Lista paginada de faltas, ordenada pela data da atividade (designationDate) desc. */
  async findAll(filter: IncidentsFilter & { page: number; pageSize: number }) {
    const where = this.buildWhere(filter);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.incidentHistories.count({ where }),
      this.prisma.incidentHistories.findMany({
        where,
        include: {
          participant: { select: { id: true, name: true, profilePhoto: true } },
          reporter: { select: { id: true, name: true } },
          designation: {
            select: {
              id: true,
              name: true,
              designationDate: true,
              group: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { designation: { designationDate: 'desc' } },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
    ]);

    return {
      page: filter.page,
      pageSize: filter.pageSize,
      total,
      data: rows.map((r) => ({
        id: r.id,
        date: r.designation.designationDate,
        reason: r.reason,
        status: r.status,
        participant: r.participant,
        reporter: r.reporter,
        group: r.designation.group,
        designation: { id: r.designation.id, name: r.designation.name },
      })),
    };
  }

  /** Agregados: total + ranking por participante + ranking por grupo. */
  async summary(filter: IncidentsFilter) {
    const groupIds = filter.groupIds ?? null;
    const name = filter.participantName ?? null;

    const byParticipant = await this.prisma.$queryRawUnsafe<{ participantId: string; name: string; count: number }[]>(
      `
      SELECT p.id AS "participantId", p.name AS "name", COUNT(*)::int AS "count"
      FROM incident_histories ih
      JOIN designations d ON d.id = ih.designation_id
      JOIN participants p ON p.id = ih.participant_id
      WHERE ($1::text[] IS NULL OR d.group_id = ANY($1::text[]))
        AND ($2::text IS NULL OR p.name ILIKE '%' || $2 || '%')
      GROUP BY p.id, p.name
      ORDER BY "count" DESC, p.name ASC
      `,
      groupIds,
      name,
    );

    const byGroup = await this.prisma.$queryRawUnsafe<{ groupId: string; name: string; count: number }[]>(
      `
      SELECT g.id AS "groupId", g.name AS "name", COUNT(*)::int AS "count"
      FROM incident_histories ih
      JOIN designations d ON d.id = ih.designation_id
      JOIN groups g ON g.id = d.group_id
      JOIN participants p ON p.id = ih.participant_id
      WHERE ($1::text[] IS NULL OR d.group_id = ANY($1::text[]))
        AND ($2::text IS NULL OR p.name ILIKE '%' || $2 || '%')
      GROUP BY g.id, g.name
      ORDER BY "count" DESC, g.name ASC
      `,
      groupIds,
      name,
    );

    const total = byParticipant.reduce((sum, r) => sum + Number(r.count), 0);

    return { total, byParticipant, byGroup };
  }

  /**
   * Saúde de faltas por grupo. "Média" de um grupo = faltas / nº de designações
   * (faltas por atividade). "Normal" = média das médias de todos os grupos que
   * têm pelo menos 1 designação.
   *
   * O benchmark (`overallAvgPerDesignation`) é sempre sobre TODOS os grupos,
   * independente do escopo do usuário — é um número agregado, não expõe dado
   * de grupo individual. `groups` já vem escopado (capitão só o(s) dele).
   */
  async health(filter: { groupIds?: string[] }) {
    const rows = await this.prisma.$queryRawUnsafe<{ groupId: string; name: string; incidents: number; designations: number }[]>(`
      SELECT g.id AS "groupId", g.name AS "name",
        COUNT(DISTINCT ih.id)::int AS "incidents",
        COUNT(DISTINCT d.id)::int AS "designations"
      FROM groups g
      LEFT JOIN designations d ON d.group_id = g.id
      LEFT JOIN incident_histories ih ON ih.designation_id = d.id
      GROUP BY g.id, g.name
    `);

    const perGroup = rows.map((r) => ({
      groupId: r.groupId,
      name: r.name,
      incidents: Number(r.incidents),
      designations: Number(r.designations),
      avgPerDesignation: Number(r.designations) > 0 ? Number(r.incidents) / Number(r.designations) : null,
    }));

    const withDesig = perGroup.filter((g) => g.avgPerDesignation !== null);
    const overallAvgPerDesignation = withDesig.length > 0 ? withDesig.reduce((s, g) => s + (g.avgPerDesignation as number), 0) / withDesig.length : 0;

    const decorate = (g: (typeof perGroup)[number]) => {
      if (g.avgPerDesignation === null) {
        return { ...g, vsOverall: null as string | null, deltaPct: null as number | null };
      }
      const delta = g.avgPerDesignation - overallAvgPerDesignation;
      const deltaPct = overallAvgPerDesignation > 0 ? (delta / overallAvgPerDesignation) * 100 : null;
      const vsOverall = Math.abs(delta) < 1e-9 ? 'equal' : delta > 0 ? 'above' : 'below';
      return { ...g, vsOverall, deltaPct };
    };

    const scoped = filter.groupIds ? perGroup.filter((g) => filter.groupIds!.includes(g.groupId)) : perGroup;

    return {
      overallAvgPerDesignation,
      groupsConsidered: withDesig.length,
      groups: scoped.map(decorate).sort((a, b) => b.incidents - a.incidents),
    };
  }
}
