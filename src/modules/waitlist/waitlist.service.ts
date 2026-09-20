import { Injectable, Logger } from '@nestjs/common';
import { GroupChangeRequests, GroupType, ParticipantSex, PetitionStatus, Weekday } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { FindWaitlistParams } from './dto/find-waitlist.params';

export type Period = 'morning' | 'afternoon' | 'evening';

export interface AvailabilityItem {
  weekDay: number;
  morning: boolean;
  afternoon: boolean;
  evening: boolean;
}

export const WEEKDAY_NUM: Record<Weekday, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

const WEEKDAY_ORDER: Weekday[] = [Weekday.SUNDAY, Weekday.MONDAY, Weekday.TUESDAY, Weekday.WEDNESDAY, Weekday.THURSDAY, Weekday.FRIDAY, Weekday.SATURDAY];

// "colocável" = ainda pode ser encaixado num grupo (0 grupos = WAITING/WAITING_INFORMATION;
// 1 grupo, respeitando a regra de composição = ACTIVE, pode pegar um 2º)
const PLACEABLE_STATUSES: PetitionStatus[] = [PetitionStatus.WAITING, PetitionStatus.WAITING_INFORMATION, PetitionStatus.ACTIVE];

export function periodOf(configStartHour: string): Period {
  const hour = parseInt(configStartHour.split(':')[0], 10);
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

// dia/horário que a pessoa quer (pedido de troca de grupo), mesmo formato da disponibilidade
export interface DesiredSlot {
  weekDay: number;
  period: Period;
}

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Pedidos de troca em aberto, por pessoa. Se a tabela ainda não existe neste ambiente (migration não
   * aplicada) a Lista de Espera segue funcionando como sempre, só sem os pedidos.
   */
  private async loadOpenRequests() {
    try {
      const rows = await this.prisma.groupChangeRequests.findMany({ where: { status: 'OPEN' } });
      return new Map(rows.map((r) => [r.participantId, r]));
    } catch (error) {
      this.logger.error(`Não foi possível carregar pedidos de troca: ${(error as Error).message}`);
      return new Map<string, GroupChangeRequests>();
    }
  }


  async getWaitlist(filter: FindWaitlistParams) {
    const groups = await this.prisma.groups.findMany({
      where: {
        type: { not: GroupType.SPECIAL },
        ...(filter.groupId && { id: filter.groupId }),
      },
      include: { participantsGroup: true },
    });

    const participants = await this.prisma.participants.findMany({
      where: {
        petitionId: { not: null },
        petitions: { status: { in: PLACEABLE_STATUSES } },
        ...(filter.name && { name: { contains: filter.name, mode: 'insensitive' } }),
        ...(filter.sex && { sex: filter.sex }),
        ...(filter.congregationId && { congregationId: filter.congregationId }),
        // treinamento não tem validade: "com treinamento" = tem alguma data registrada
        ...(filter.hasTraining && { lastTrainingDate: { not: null } }),
      },
      include: {
        petitions: { select: { createdAt: true } },
        congregation: { select: { id: true, name: true, city: true } },
        participantsGroup: { include: { group: { select: { id: true, name: true, type: true } } } },
      },
    });

    const requests = await this.loadOpenRequests();

    // capacidade de cada participante (quantos grupos MAIN/ADDITIONAL já ocupa)
    const withCapacity = participants
      .filter((p) => p.petitions) // sempre true dado o where, só pra TS
      .map((p) => {
        const mainCount = p.participantsGroup.filter((pg) => pg.group.type === GroupType.MAIN).length;
        const addCount = p.participantsGroup.filter((pg) => pg.group.type === GroupType.ADDITIONAL).length;
        return {
          participant: p,
          mainCount,
          addCount,
          total: mainCount + addCount,
          // grupos Centro/Adicional em que já está (Especial não entra na regra)
          groups: p.participantsGroup.filter((pg) => pg.group.type !== GroupType.SPECIAL).map((pg) => pg.group),
          waitingSince: p.petitions!.createdAt,
          availability: (p.availability as unknown as AvailabilityItem[]) ?? [],
        };
      });

    const groupCards = groups
      .map((g) => {
        const weekdayNum = WEEKDAY_NUM[g.configWeekday];
        const period = periodOf(g.configStartHour);

        const entries = withCapacity.flatMap((c) => {
          // já está nesse grupo: não é candidato dele
          if (c.groups.some((x) => x.id === g.id)) return [];

          const request = requests.get(c.participant.id) ?? null;
          const desired = request ? (request.desiredSlots as unknown as DesiredSlot[]) : [];

          // regra de composição: 1 Centro (MAIN) + 1 adicional, ou 2 adicionais
          const canAdd = c.total < 2 && !(g.type === GroupType.MAIN && c.mainCount > 0);
          // disponibilidade no dia/período do grupo
          const match = c.availability.find((a) => a.weekDay === weekdayNum);
          const available = !!match && !!match[period];

          // pedido de troca: de quais grupos atuais ele poderia SAIR pra entrar neste (composição sobre o que sobra)
          const swapFrom = request
            ? c.groups.filter((leaving) => {
                const remaining = c.groups.filter((x) => x.id !== leaving.id);
                return !(g.type === GroupType.MAIN && remaining.some((x) => x.type === GroupType.MAIN));
              })
            : [];
          const wantsThisSlot = desired.some((slot) => slot.weekDay === weekdayNum && slot.period === period);

          const asCandidate = canAdd && available;
          const asSwap = wantsThisSlot && (canAdd || swapFrom.length > 0);
          if (!asCandidate && !asSwap) return [];
          return [{ c, request, canAdd, swapFrom, viaSwapOnly: !asCandidate }];
        });

        const candidates = entries
          .map((e) => ({ ...e, since: e.viaSwapOnly && e.request ? e.request.createdAt : e.c.waitingSince }))
          .sort((a, b) => a.since.getTime() - b.since.getTime())
          .map(({ c, request, canAdd, swapFrom, viaSwapOnly, since }) => ({
            participantId: c.participant.id,
            name: c.participant.name,
            sex: c.participant.sex,
            phone: c.participant.phone,
            profilePhoto: c.participant.profilePhoto,
            congregation: c.participant.congregation,
            availability: c.availability,
            waitingSince: since,
            // pedido de troca de grupo (a pessoa continua nos grupos atuais)
            changeRequest: request
              ? {
                  id: request.id,
                  reason: request.reason,
                  note: request.note,
                  desiredSlots: request.desiredSlots as unknown as DesiredSlot[],
                  requestedByName: request.requestedByName,
                  createdAt: request.createdAt,
                  currentGroups: c.groups.map((x) => ({ groupId: x.id, name: x.name, type: x.type })),
                }
              : null,
            canAdd, // pode entrar sem sair de nenhum grupo
            swapFrom: swapFrom.map((x) => ({ groupId: x.id, name: x.name, type: x.type })), // grupos de que pode sair pra entrar aqui
            viaSwapOnly, // aparece aqui só por causa do pedido de troca (não é "espera" comum)
          }));

        // todo grupo tem um máximo, e o que vale como "mínimo" é esse máximo: qualquer
        // grupo abaixo dele tem vagas e precisa de gente (configMin fica só informativo)
        const currentMembers = g.participantsGroup.length;
        const vacancies = Math.max(g.configMax - currentMembers, 0);
        return {
          groupId: g.id,
          name: g.name,
          type: g.type,
          weekday: g.configWeekday,
          period,
          configStartHour: g.configStartHour,
          configEndHour: g.configEndHour,
          configMin: g.configMin,
          configMax: g.configMax,
          currentMembers,
          vacancies,
          needsHelp: vacancies > 0,
          candidates,
        };
      })
      .sort((a, b) => {
        const dayDiff = WEEKDAY_ORDER.indexOf(a.weekday) - WEEKDAY_ORDER.indexOf(b.weekday);
        if (dayDiff !== 0) return dayDiff;
        return a.configStartHour.localeCompare(b.configStartHour);
      });

    // total da lista de espera = pessoas distintas que aparecem em pelo menos 1 coluna (sem contar quem
    // só aparece por causa de um pedido de troca: essas pessoas já têm grupo)
    const distinct = new Map<string, ParticipantSex>();
    const wantingChange = new Set<string>();
    for (const g of groupCards) {
      for (const c of g.candidates) {
        if (!c.viaSwapOnly) distinct.set(c.participantId, c.sex);
        if (c.changeRequest) wantingChange.add(c.participantId);
      }
    }
    const bySex = { MALE: 0, FEMALE: 0 };
    for (const sex of distinct.values()) bySex[sex]++;

    return {
      summary: {
        groupsNeedingHelp: groupCards.filter((g) => g.needsHelp).length,
        waitlistTotal: distinct.size,
        bySex,
        wantingChange: wantingChange.size,
      },
      groups: groupCards,
    };
  }
}
