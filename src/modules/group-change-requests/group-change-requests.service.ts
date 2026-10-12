import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, Weekday } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { GroupScopeService } from 'src/shared/group-scope.service';
import { JwtPayload } from 'src/shared/types';
import { AuditAction, AuditService } from '../audit/audit.service';
import { periodOf, WEEKDAY_NUM } from '../waitlist/waitlist.service';
import { CreateChangeRequestDto, FindChangeRequestsParams } from './dto/group-change-requests.dto';

export interface DesiredSlot {
  weekDay: number;
  period: 'morning' | 'afternoon' | 'evening';
}

type Resolution = 'MOVED' | 'ADDED' | 'LEFT';

/**
 * Pedido de troca de grupo. A pessoa continua nos grupos atuais; o pedido diz em que dia/horário
 * ela quer ir se abrir vaga e por quê. Quem marca: capitão/assistente do grupo dela ou coordenador.
 */
@Injectable()
export class GroupChangeRequestsService {
  private readonly logger = new Logger(GroupChangeRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly groupScope: GroupScopeService,
    private readonly audit: AuditService,
  ) {}

  /** 403 se a pessoa não for da alçada de quem chama (capitão só enxerga os grupos onde é capitão). */
  private async assertCanHandle(actor: JwtPayload, participantGroupIds: string[]) {
    const scope = await this.groupScope.resolve(actor); // 403 pra quem não é coordenador/analista/capitão
    if (!scope.all && !participantGroupIds.some((id) => scope.groupIds.includes(id))) {
      throw new ForbiddenException('Você só pode mexer em voluntários do seu grupo');
    }
  }

  async create(dto: CreateChangeRequestDto, actor: JwtPayload) {
    const participant = await this.prisma.participants.findUnique({
      where: { id: dto.participantId },
      select: { id: true, name: true, participantsGroup: { select: { groupId: true, group: { select: { id: true, name: true, type: true } } } } },
    });
    if (!participant) throw new NotFoundException('Voluntário não encontrado');

    const groups = participant.participantsGroup;
    if (groups.length === 0) {
      throw new BadRequestException('Essa pessoa não está em nenhum grupo — ela já aparece na Lista de Espera');
    }
    await this.assertCanHandle(actor, groups.map((g) => g.groupId));

    const alreadyOpen = await this.prisma.groupChangeRequests.findFirst({ where: { participantId: participant.id, status: 'OPEN' } });
    if (alreadyOpen) throw new ConflictException('Essa pessoa já tem um pedido de troca em aberto');

    // tira dia/horário repetido
    const slots = [...new Map(dto.desiredSlots.map((s) => [`${s.weekDay}|${s.period}`, { weekDay: s.weekDay, period: s.period }])).values()];

    const created = await this.prisma.groupChangeRequests.create({
      data: {
        participantId: participant.id,
        participantName: participant.name,
        desiredSlots: slots as unknown as Prisma.InputJsonValue,
        reason: dto.reason,
        note: dto.note ?? null,
        requestedById: actor.id ?? null,
        requestedByName: actor.name ?? null,
      },
    });
    await this.audit.log({
      actor,
      action: AuditAction.GROUP_CHANGE_REQUESTED,
      entity: 'participant',
      entityId: participant.id,
      entityName: participant.name,
      metadata: { slots, reason: dto.reason, note: dto.note ?? null, groups: groups.map((g) => g.group.name) },
    });
    return created;
  }

  async cancel(id: string, actor: JwtPayload) {
    const request = await this.prisma.groupChangeRequests.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Pedido não encontrado');
    if (request.status !== 'OPEN') throw new ConflictException('Esse pedido já foi encerrado');

    const memberships = await this.prisma.participantsGroups.findMany({ where: { participantId: request.participantId }, select: { groupId: true } });
    await this.assertCanHandle(actor, memberships.map((m) => m.groupId));

    const updated = await this.prisma.groupChangeRequests.update({
      where: { id },
      data: { status: 'CANCELLED', resolution: 'CANCELLED', resolvedAt: new Date(), resolvedById: actor.id ?? null, resolvedByName: actor.name ?? null },
    });
    await this.audit.log({
      actor,
      action: AuditAction.GROUP_CHANGE_CANCELLED,
      entity: 'participant',
      entityId: request.participantId,
      entityName: request.participantName,
      metadata: { requestId: id },
    });
    return updated;
  }

  async findAll(params: FindChangeRequestsParams, actor: JwtPayload) {
    const scope = await this.groupScope.resolve(actor);
    const status = params.status ?? 'OPEN';

    const and: Prisma.GroupChangeRequestsWhereInput[] = [];
    if (status !== 'ALL') and.push({ status });
    if (params.participantId) and.push({ participantId: params.participantId });

    // capitão: só pedidos de quem está nos grupos dele
    let visibleGroupIds: string[] | undefined = scope.all ? undefined : scope.groupIds;
    if (params.groupId) {
      if (!scope.all && !scope.groupIds.includes(params.groupId)) throw new ForbiddenException('Sem acesso a esse grupo');
      visibleGroupIds = [params.groupId];
    }
    if (visibleGroupIds) {
      const members = await this.prisma.participantsGroups.findMany({
        where: { groupId: { in: visibleGroupIds } },
        select: { participantId: true },
        distinct: ['participantId'],
      });
      and.push({ participantId: { in: members.map((m) => m.participantId) } });
    }

    const rows = await this.prisma.groupChangeRequests.findMany({ where: { AND: and }, orderBy: { createdAt: 'desc' }, take: 200 });

    const memberships = await this.prisma.participantsGroups.findMany({
      where: { participantId: { in: rows.map((r) => r.participantId) } },
      select: { participantId: true, group: { select: { id: true, name: true, type: true } } },
    });
    return rows.map((r) => ({
      ...r,
      currentGroups: memberships.filter((m) => m.participantId === r.participantId).map((m) => ({ groupId: m.group.id, name: m.group.name, type: m.group.type })),
    }));
  }

  /**
   * Fecha o pedido em aberto da pessoa (troca feita, entrou no grupo desejado ou saiu de todos).
   * NUNCA lança: é efeito colateral de outra operação e não pode derrubá-la (ex.: tabela ainda não
   * criada neste ambiente). Devolve quantos pedidos fechou.
   */
  async resolveOpen(participantId: string, resolution: Resolution, opts: { group?: { id: string; name: string }; actor?: JwtPayload } = {}): Promise<number> {
    try {
      const open = await this.prisma.groupChangeRequests.findMany({ where: { participantId, status: 'OPEN' } });
      if (open.length === 0) return 0;

      await this.prisma.groupChangeRequests.updateMany({
        where: { participantId, status: 'OPEN' },
        data: {
          status: 'DONE',
          resolution,
          resolvedAt: new Date(),
          resolvedById: opts.actor?.id ?? null,
          resolvedByName: opts.actor?.name ?? null,
          resolvedGroupId: opts.group?.id ?? null,
          resolvedGroupName: opts.group?.name ?? null,
        },
      });
      await this.audit.log({
        actor: opts.actor,
        action: AuditAction.GROUP_CHANGE_RESOLVED,
        entity: 'participant',
        entityId: participantId,
        entityName: open[0].participantName,
        metadata: { resolution, groupName: opts.group?.name ?? null },
      });
      return open.length;
    } catch (error) {
      this.logger.error(`Falha ao fechar pedido de troca de ${participantId}: ${(error as Error).message}`);
      return 0;
    }
  }

  /** Entrou num grupo: se o dia/horário dele é um dos desejados no pedido, o pedido foi atendido. */
  async resolveIfMatchesGroup(participantId: string, group: { id: string; name: string; configWeekday: Weekday; configStartHour: string }, actor?: JwtPayload) {
    try {
      const open = await this.prisma.groupChangeRequests.findFirst({ where: { participantId, status: 'OPEN' } });
      if (!open) return;
      const slots = open.desiredSlots as unknown as DesiredSlot[];
      const weekDay = WEEKDAY_NUM[group.configWeekday];
      const period = periodOf(group.configStartHour);
      if (slots.some((s) => s.weekDay === weekDay && s.period === period)) {
        await this.resolveOpen(participantId, 'ADDED', { group, actor });
      }
    } catch (error) {
      this.logger.error(`Falha ao conferir pedido de troca de ${participantId}: ${(error as Error).message}`);
    }
  }
}
