import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DesignationStatus, GroupType, IncidentStatus, Prisma } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { TransactionLogger } from 'src/infra/transaction.logger';
import { JwtPayload } from 'src/shared/types';
import { UpdateIncidentDto } from './dto/incident.dto';

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
    // mandatoryPresence: false => capitão marcou a semana como "Presença Opcional".
    // Faltas dessa designação não devem contar no Painel de Faltas (sempre aplicado,
    // mesmo sem outros filtros de grupo/data).
    const designationIs: Prisma.DesignationsWhereInput = {
      mandatoryPresence: true,
      ...(filter.groupIds && { groupId: { in: filter.groupIds } }),
      ...((from || to) && {
        designationDate: { ...(from && { gte: from }), ...(to && { lte: to }) },
      }),
    };

    return {
      designation: { is: designationIs },
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

    // d.mandatory_presence = true: exclui faltas de designações marcadas "Presença Opcional".
    const dateWhere = `
        AND d.mandatory_presence = true
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
   *
   * Duas médias: o Centro (MAIN) e os Adicionais (ADDITIONAL) têm "normais" diferentes, então
   * cada grupo também é comparado com a média do PRÓPRIO tipo (`typeAvgPerDesignation`,
   * `vsType`, `deltaPctType`). `overallByType` traz as médias por tipo; para quem não vê todos
   * os grupos (`restrictToScope`, o capitão) só vem o(s) tipo(s) dos grupos dele — o resto é null.
   * Os campos gerais (`overallAvgPerDesignation`, `vsOverall`, `deltaPct`) continuam como eram.
   */
  async health(filter: { groupIds?: string[]; dateFrom?: string; dateTo?: string; restrictToScope?: boolean }) {
    const from = filter.dateFrom ? `${filter.dateFrom} 00:00:00` : null;
    const to = filter.dateTo ? `${filter.dateTo} 23:59:59.999` : null;

    // filtro de data vai no JOIN das designações: grupos sem designação no
    // período continuam aparecendo (média null), como quando não há filtro.
    const rows = await this.prisma.$queryRawUnsafe<{ groupId: string; name: string; type: GroupType; incidents: number; designations: number }[]>(
      `
      SELECT g.id AS "groupId", g.name AS "name", g.type::text AS "type",
        COUNT(DISTINCT ih.id)::int AS "incidents",
        COUNT(DISTINCT d.id)::int AS "designations"
      FROM groups g
      LEFT JOIN designations d ON d.group_id = g.id
        AND ($1::timestamp IS NULL OR d.designation_date >= $1::timestamp)
        AND ($2::timestamp IS NULL OR d.designation_date <= $2::timestamp)
      -- "dias trabalhados" (designations) conta normalmente mesmo em semana opcional;
      -- só a FALTA (numerador) de uma designação "Presença Opcional" não entra na média.
      LEFT JOIN incident_histories ih ON ih.designation_id = d.id AND d.mandatory_presence = true
      GROUP BY g.id, g.name, g.type
      `,
      from,
      to,
    );

    const perGroup = rows.map((r) => ({
      groupId: r.groupId,
      name: r.name,
      type: r.type,
      incidents: Number(r.incidents),
      designations: Number(r.designations),
      avgPerDesignation: Number(r.designations) > 0 ? Number(r.incidents) / Number(r.designations) : null,
    }));

    const withDesig = perGroup.filter((g) => g.avgPerDesignation !== null);
    const overallAvgPerDesignation = withDesig.length > 0 ? withDesig.reduce((s, g) => s + (g.avgPerDesignation as number), 0) / withDesig.length : 0;

    // média das médias por tipo de grupo (Centro x Adicional x Especial)
    type TypeBenchmark = { avg: number | null; groups: number };
    const byType = {} as Record<GroupType, TypeBenchmark>;
    for (const t of Object.values(GroupType)) {
      const list = withDesig.filter((g) => g.type === t);
      byType[t] = { avg: list.length > 0 ? list.reduce((sum, g) => sum + (g.avgPerDesignation as number), 0) / list.length : null, groups: list.length };
    }

    // compara uma média com um benchmark: acima / abaixo / igual + variação percentual
    const compare = (avg: number, benchmark: number | null) => {
      if (benchmark === null) return { vs: null as string | null, deltaPct: null as number | null };
      const delta = avg - benchmark;
      return {
        vs: Math.abs(delta) < 1e-9 ? 'equal' : delta > 0 ? 'above' : 'below',
        deltaPct: benchmark > 0 ? (delta / benchmark) * 100 : null,
      };
    };

    const decorate = (g: (typeof perGroup)[number]) => {
      if (g.avgPerDesignation === null) {
        return {
          ...g,
          vsOverall: null as string | null,
          deltaPct: null as number | null,
          typeAvgPerDesignation: null as number | null,
          vsType: null as string | null,
          deltaPctType: null as number | null,
        };
      }
      const overall = compare(g.avgPerDesignation, overallAvgPerDesignation);
      const typeAvg = byType[g.type].avg;
      const typed = compare(g.avgPerDesignation, typeAvg);
      return { ...g, vsOverall: overall.vs, deltaPct: overall.deltaPct, typeAvgPerDesignation: typeAvg, vsType: typed.vs, deltaPctType: typed.deltaPct };
    };

    const scoped = filter.groupIds ? perGroup.filter((g) => filter.groupIds!.includes(g.groupId)) : perGroup;

    // capitão: só a média do(s) tipo(s) do(s) grupo(s) dele
    const scopedTypes = new Set(scoped.map((g) => g.type));
    const overallByType = {} as Record<GroupType, TypeBenchmark | null>;
    for (const t of Object.values(GroupType)) {
      overallByType[t] = filter.restrictToScope && !scopedTypes.has(t) ? null : byType[t];
    }

    return {
      overallAvgPerDesignation,
      groupsConsidered: withDesig.length,
      overallByType,
      groups: scoped.map(decorate).sort((a, b) => b.incidents - a.incidents),
    };
  }

  // --------------------------------------------------------------------------------------
  // Escrita de faltas (veio da legacy). Mesmo caminho/mesmas regras para o front não mudar.
  // --------------------------------------------------------------------------------------

  /**
   * Registra a falta do voluntário numa designação e tira ele do ponto da designação.
   *
   * A legacy removia a pessoa do ponto e publicava a designação INTEIRA na fila FIFO; o
   * consumidor reescrevia `assignments_participants` do zero com o estado lido antes da
   * transação. Aqui deletamos só as linhas do voluntário, dentro da mesma transação:
   * mesmo resultado no banco, sem a corrida de ler-antes-e-escrever-depois e sem chamada
   * de rede dentro da transação.
   */
  async create(designationId: string, participantId: string, reason: string, actor?: JwtPayload) {
    // sem token (é rota pública: o voluntário abre pelo link do WhatsApp), quem reporta é o próprio
    const reporterId = actor?.id ?? participantId;

    const [participant, reporter] = await Promise.all([
      this.prisma.participants.findUnique({ where: { id: participantId }, select: { id: true, name: true } }),
      this.prisma.participants.findUnique({ where: { id: reporterId }, select: { id: true } }),
    ]);

    // a pessoa precisa estar num grupo que tenha esta designação
    const inGroupOfDesignation = await this.prisma.participantsGroups.findFirst({
      where: { participantId, group: { designations: { some: { id: designationId } } } },
      select: { id: true },
    });

    if (!participant || !reporter || !inGroupOfDesignation) {
      throw new NotFoundException('Parâmetros inválidos ou participante não encontrado na designação');
    }

    const designation = await this.prisma.designations.findUnique({
      where: { id: designationId },
      select: { id: true, status: true },
    });
    if (!designation) throw new NotFoundException('Designação não encontrada');

    const alreadyOpen = await this.prisma.incidentHistories.findFirst({
      where: { participantId, designationId, status: IncidentStatus.OPEN },
      select: { id: true },
    });
    if (alreadyOpen) throw new BadRequestException('Já existe um incidente aberto para este participante nesta designação');

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.incidentHistories.create({
          data: {
            participantId: participant.id,
            reporterId: reporter.id,
            reason,
            status: IncidentStatus.OPEN,
            designationId: designation.id,
          },
        });

        // tira do ponto: os vínculos desta pessoa com os pontos desta designação
        const links = await tx.assignmentsParticipants.findMany({
          where: { participantId: participant.id, assignment: { designationsId: designationId } },
          select: { id: true },
        });
        if (links.length) {
          await tx.assignmentsParticipants.deleteMany({ where: { id: { in: links.map((l) => l.id) } } });
        }
      });
    } catch (error) {
      // `@@unique([participantId, designationId])`: mesmo com a falta já fechada/cancelada,
      // o banco recusa uma segunda. A legacy devolvia aqui um "Erro ao criar incidente" genérico.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('Já existe um incidente registrado para este participante nesta designação');
      }
      throw error;
    }

    return { message: 'Incidente criado com sucesso' };
  }

  /** Busca o incidente scoped na designação+participante: a rota traz os três ids e precisa casar. */
  private async findScopedIncident(designationId: string, participantId: string, incidentId: string) {
    const incident = await this.prisma.incidentHistories.findFirst({
      where: { id: incidentId, participantId, designationId },
      include: { designation: { select: { status: true } } },
    });
    if (!incident) throw new NotFoundException('Incidente não encontrado para este participante nesta designação');
    return incident;
  }

  async update(designationId: string, participantId: string, incidentId: string, dto: UpdateIncidentDto) {
    const incident = await this.findScopedIncident(designationId, participantId, incidentId);

    const status = incident.designation.status;
    if (status === DesignationStatus.CANCELLED || status === DesignationStatus.ARCHIVED) {
      throw new ForbiddenException('Designação está cancelada ou arquivada');
    }

    await this.prisma.incidentHistories.update({
      where: { id: incidentId },
      data: {
        status: dto.status ?? incident.status,
        reason: dto.reason ?? incident.reason,
      },
    });

    return { message: 'Incidente atualizado com sucesso' };
  }

  async remove(designationId: string, participantId: string, incidentId: string) {
    const incident = await this.findScopedIncident(designationId, participantId, incidentId);

    const status = incident.designation.status;
    if (status !== DesignationStatus.OPEN && status !== DesignationStatus.IN_PROGRESS) {
      throw new ForbiddenException('Designação está cancelada ou arquivada não é possível excluir incidentes');
    }

    await this.prisma.incidentHistories.delete({ where: { id: incidentId } });
    return { message: 'Incidente deletado com sucesso' };
  }
}
