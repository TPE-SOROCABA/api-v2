import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DesignationStatus, IncidentStatus, ParticipantGroupProfile } from '@prisma/client';

import { PrismaService } from 'src/infra/prisma/prisma.service';
import { profilePhotoOrAvatar } from 'src/shared/fake-image';
import { WEEKDAY_PT_BR } from 'src/shared/weekday.util';
import { DesignationModel, designationViewInclude, filterDesignationAssignments, nextDate, toDesignationView } from './designation-view.mapper';
import { DesignationEventEntry, DesignationView } from './designation-view.types';
/**
 * Aceita `YYYY-MM-DD` e `YYYY-M-D` (o dayjs, na legacy, aceitando os dois formatos)
 * e monta a data em horário LOCAL — `dayjs("2024-01-05 00:00")` sem plugin de
 * timezone é local, e é isso que a query prisma espera.
 * Devolve `null` para qualquer outra coisa, incluindo `undefined` e string vazia
 * (a legacy tratava isso como data inválida e devolvia 400).
 */
function parseLocalDay(value: string | undefined): { year: number; month: number; day: number } | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day] = match.map(Number) as unknown as number[];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

@Injectable()
export class DesignationViewService {
  constructor(private readonly prisma: PrismaService) {}

  /** `GET /groups/:groupId/designations/week` — a designação aberta do grupo. */
  async findByGroupId(groupId: string, filter?: string): Promise<DesignationView> {
    const model = await this.prisma.designations.findFirst({
      where: { groupId, status: { not: DesignationStatus.ARCHIVED } },
      include: designationViewInclude,
    });
    if (!model) {
      const group = await this.prisma.groups.findUnique({ where: { id: groupId }, select: { id: true, status: true } });
      if (!group) throw new NotFoundException({ statusCode: 404, code: 'GROUP_NOT_FOUND', message: 'Grupo não encontrado' });
      throw new NotFoundException({ statusCode: 404, code: 'DESIGNATION_NOT_FOUND', message: 'Designação não encontrada', groupStatus: group.status });
    }

    const view = toDesignationView(model);
    return filter ? filterDesignationAssignments(view, filter) : view;
  }

  /**
   * A designação ARQUIVADA mais recente do grupo — é com ela que a legacy
   * comparava o sorteio para não repetir a escala da semana anterior
   * (`DesignationRepository.findOneOld`: `status: ARCHIVED`, `orderBy: updatedAt desc`).
   *
   * Devolve `null` quando não há nenhuma: a legacy pegava o 404 do repositório
   * com `.catch(() => null)` e seguia sem comparar.
   */
  async previousArchivedDesignation(groupId: string): Promise<DesignationView | null> {
    const model = await this.prisma.designations.findFirst({
      where: { groupId, status: DesignationStatus.ARCHIVED },
      orderBy: { updatedAt: 'desc' },
      include: designationViewInclude,
    });
    return model ? toDesignationView(model) : null;
  }

  /**
   * `GET /designations/:id` — por id, sem filtro de status.
   *
   * A legacy devolvia a mesma coisa (`findByDesignationId` + `toJson()`); aqui o
   * shape é o de `DesignationView`, que é o que o `admin-tpe` espera.
   */
  async findById(designationId: string): Promise<DesignationView> {
    return toDesignationView(await this.loadById(designationId));
  }

  /** `GET /groups/:groupId/designations/week-details` — o grupo e a designação atual. */
  async findWeekDetails(groupId: string) {
    const group = await this.prisma.groups.findFirst({
      where: { id: groupId },
      include: {
        coordinator: true,
        designations: { where: { status: { not: DesignationStatus.ARCHIVED } } },
      },
    });
    if (!group) throw new NotFoundException('Grupo não encontrado');

    return {
      id: group.id,
      name: group.name,
      configWeekday: WEEKDAY_PT_BR[group.configWeekday],
      coordinator: group.coordinator,
      designation: group.designations[0],
    };
  }

  /**
   * `GET /groups/:groupId/designations` — histórico do grupo, no máximo 10 linhas.
   *
   * Paridade importante: na legacy as DUAS datas são obrigatórias — `dayjs(undefined).isValid()`
   * é `false`, então mandar só uma (ou nenhuma) devolvia 400. Mantido aqui para não
   * mudar o que o front recebe.
   */
  async findHistory(groupId: string, dateFrom?: string, dateTo?: string) {
    const from = parseLocalDay(dateFrom);
    const to = parseLocalDay(dateTo);
    if (!from || !to) {
      throw new BadRequestException('Parâmetros de data devem estar no formato YYYY-MM-DD');
    }

    return this.prisma.designations.findMany({
      where: {
        groupId,
        designationDate: {
          gte: new Date(from.year, from.month - 1, from.day, 0, 0, 0, 0),
          // 23:59 exatos (sem os 59 segundos) — é o que a legacy fazia com `dayjs(dateTo + "23:59")`
          lte: new Date(to.year, to.month - 1, to.day, 23, 59, 0, 0),
        },
      },
      orderBy: { designationDate: 'desc' },
      take: 10,
    });
  }

  /**
   * `GET /designations/:id/participants` — como a public/start da legacy monta:
   * uma linha por ponto, mais uma linha sintética "Capitães" quando há
   * capitão/coordenador do grupo que não caiu em nenhum ponto.
   */
  async findEventEntries(designationId: string): Promise<DesignationEventEntry[]> {
    const designation = await this.findById(designationId);
    if (designation.status !== DesignationStatus.IN_PROGRESS) return [];

    const assignedIds = new Set(designation.assignments.flatMap((a) => a.participants.map((p) => p.id)));
    // Só capitão/assistente: aqui `profile` é o CARGO NO GRUPO (`ParticipantGroupProfile`),
    // que não tem COORDINATOR. A legacy ainda comparava com "COORDINATOR" — comparação
    // morta desde sempre, mantida fora só para o TypeScript não brigar.
    const unassignedCaptains = designation.participants.filter((p) => !assignedIds.has(p.id) && p.profile === ParticipantGroupProfile.CAPTAIN);

    const base = {
      event: await this.eventLabel(designation),
      createdAt: designation.createdAt,
      updatedAt: designation.updatedAt,
      expirationDate: nextDate(designation.group),
      status: designation.status,
    };

    return [
      ...(unassignedCaptains.length > 0
        ? [
            {
              ...base,
              point: 'Capitães',
              participants: unassignedCaptains.map((p) => ({
                name: p.name,
                profile_photo: p.profile_photo,
              })),
              publication_carts: [],
            },
          ]
        : []),
      ...designation.assignments.map((assignment) => ({
        ...base,
        point: assignment.point.name,
        participants: assignment.participants.map((p) => ({
          name: p.name,
          profile_photo: p.profile_photo,
        })),
        publication_carts: assignment.publication_carts.map((c) => c.name),
      })),
    ];
  }

  /**
   * `GET /designations/:id/participants/:participantId` — a linha do voluntário na
   * designação dele. É o endpoint que a página pública do WhatsApp consome.
   */
  async findParticipantEventEntry(designationId: string, participantId: string): Promise<DesignationEventEntry[]> {
    const designation = await this.findById(designationId);
    if (designation.status !== DesignationStatus.CLOSED && designation.status !== DesignationStatus.IN_PROGRESS) {
      return [];
    }

    // só o ponto em que a pessoa está
    const assignments = designation.assignments.filter((a) => a.participants.some((p) => p.id === participantId));

    const participant = await this.prisma.participants.findUnique({
      where: { id: participantId },
      include: {
        incidentParticipant: { where: { designationId } },
        participantsGroup: { where: { groupId: designation.group.id } },
      },
    });
    if (!participant) throw new NotFoundException('Participante não encontrado');
    if (!participant.participantsGroup?.length) {
      throw new BadRequestException('Participante não está associado ao grupo');
    }

    const incident = participant.incidentParticipant[0] ?? null;
    const status = incident ? incident.status : IncidentStatus.CLOSED;
    const isAssigned = assignments.length > 0;
    const photo = profilePhotoOrAvatar(participant);

    let details: Pick<DesignationEventEntry, 'point' | 'participants' | 'publication_carts'>;
    if (status === IncidentStatus.OPEN || !isAssigned) {
      details = {
        point: 'Sem designação',
        participants: { name: participant.name, profile_photo: photo },
        publication_carts: [],
      };
    } else {
      const first = assignments[0];
      details = {
        point: first.point.name,
        participants: first.participants.map((p) => ({
          name: p.name,
          profile_photo: p.profile_photo,
        })),
        publication_carts: first.publication_carts.map((c) => c.name),
      };
    }

    // capitão/assistente sem ponto e sem falta vai para a seção "Capitães"
    const groupProfile = participant.participantsGroup[0].profile;
    const isCaptainOrAssistant = groupProfile === ParticipantGroupProfile.CAPTAIN || groupProfile === ParticipantGroupProfile.ASSISTANT_CAPTAIN;
    if (isCaptainOrAssistant && !isAssigned && status !== IncidentStatus.OPEN) {
      details = {
        point: 'Capitães',
        participants: [{ name: participant.name, profile_photo: photo }],
        publication_carts: [],
      };
    }

    return [
      {
        event: await this.eventLabel(designation),
        createdAt: designation.createdAt,
        updatedAt: designation.updatedAt,
        expirationDate: nextDate(designation.group),
        ...details,
        incident_history: incident ? { id: incident.id, reason: incident.reason, status: incident.status } : null,
        status: designation.status,
      },
    ];
  }

  private async loadById(designationId: string): Promise<DesignationModel> {
    const model = await this.prisma.designations.findFirst({
      where: { id: designationId },
      include: designationViewInclude,
    });
    if (!model) throw new NotFoundException('Designação não encontrada');
    return model;
  }

  /** "Evento - Grupo", ou só o nome do grupo quando o grupo não tem evento. */
  private async eventLabel(designation: DesignationView): Promise<string> {
    const eventDayGroup = await this.prisma.eventDayGroups.findFirst({
      where: { groupId: designation.group.id },
      include: { eventDay: true },
    });
    const eventName = eventDayGroup?.eventDay?.name;
    return eventName ? `${eventName} - ${designation.group.name}` : designation.group.name;
  }
}
