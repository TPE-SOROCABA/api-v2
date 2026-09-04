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
  /** intervalo pela data da atividade (designationDate), 'yyyy-MM-dd' */
  dateFrom?: string;
  dateTo?: string;
}

/**
 * 'yyyy-MM-dd' -> Date no início/fim do dia. Usa `Z` de propósito: o Prisma
 * trata a coluna `designation_date` (timestamp sem tz) como UTC, então
 * comparar com um Date UTC-wall-clock casa com o `::timestamp` do SQL cru.
 */
function parseFrom(d?: string): Date | null {
  return d ? new Date(`${d}T00:00:00.000Z`) : null;
}
function parseTo(d?: string): Date | null {
  return d ? new Date(`${d}T23:59:59.999Z`) : null;
}

@Injectable()
export class IncidentsService {
  private readonly logger = new TransactionLogger(IncidentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(filter: IncidentsFilter): Prisma.IncidentHistoriesWhereInput {
    const from = parseFrom(filter.dateFrom);
    const to = parseTo(filter.dateTo);
    const designationIs: Prisma.DesignationsWhereInput = {
      ...(filter.groupIds && { groupId: { in: filter.groupIds } }),
      ...((from || to) && {
        designationDate: { ...(from && { gte: from }), ...(to && { lte: to }) },
      }),
    };

    return {
      ...(Object.keys(designationIs).length > 0 && { designation: { is: designationIs } }),
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
    const from = filter.dateFrom ? `${filter.dateFrom} 00:00:00` : null;
    const to = filter.dateTo ? `${filter.dateTo} 23:59:59.999` : null;

    const dateWhere = `
        AND ($3::timestamp IS NULL OR d.designation_date >= $3::timestamp)
        AND ($4::timestamp IS NULL OR d.designation_date <= $4::timestamp)`;

    const byParticipant = await this.prisma.$queryRawUnsafe<{ participantId: string; name: string; count: number }[]>(
      `
      SELECT p.id AS "participantId", p.name AS "name", COUNT(*)::int AS "count"
      FROM incident_histories ih
      JOIN designations d ON d.id = ih.designation_id
      JOIN participants p ON p.id = ih.participant_id
      WHERE ($1::text[] IS NULL OR d.group_id = ANY($1::text[]))
        AND ($2::text IS NULL OR p.name ILIKE '%' || $2 || '%')${dateWhere}
      GROUP BY p.id, p.name
      ORDER BY "count" DESC, p.name ASC
      `,
      groupIds,
      name,
      from,
      to,
    );

    const byGroup = await this.prisma.$queryRawUnsafe<{ groupId: string; name: string; count: number }[]>(
      `
      SELECT g.id AS "groupId", g.name AS "name", COUNT(*)::int AS "count"
      FROM incident_histories ih
      JOIN designations d ON d.id = ih.designation_id
      JOIN groups g ON g.id = d.group_id
      JOIN participants p ON p.id = ih.participant_id
      WHERE ($1::text[] IS NULL OR d.group_id = ANY($1::text[]))
        AND ($2::text IS NULL OR p.name ILIKE '%' || $2 || '%')${dateWhere}
      GROUP BY g.id, g.name
      ORDER BY "count" DESC, g.name ASC
      `,
      groupIds,
      name,
      from,
      to,
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
  async health(filter: { groupIds?: string[]; dateFrom?: string; dateTo?: string }) {
    const from = filter.dateFrom ? `${filter.dateFrom} 00:00:00` : null;
    const to = filter.dateTo ? `${filter.dateTo} 23:59:59.999` : null;

    // filtro de data vai no JOIN das designações: grupos sem designação no
    // período continuam aparecendo (média null), como quando não há filtro.
    const rows = await this.prisma.$queryRawUnsafe<{ groupId: string; name: string; incidents: number; designations: number }[]>(
      `
      SELECT g.id AS "groupId", g.name AS "name",
        COUNT(DISTINCT ih.id)::int AS "incidents",
        COUNT(DISTINCT d.id)::int AS "designations"
      FROM groups g
      LEFT JOIN designations d ON d.group_id = g.id
        AND ($1::timestamp IS NULL OR d.designation_date >= $1::timestamp)
        AND ($2::timestamp IS NULL OR d.designation_date <= $2::timestamp)
      LEFT JOIN incident_histories ih ON ih.designation_id = d.id
      GROUP BY g.id, g.name
      `,
      from,
      to,
    );

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
