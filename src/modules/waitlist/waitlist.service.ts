import { Injectable } from '@nestjs/common';
import { GroupType, ParticipantSex, PetitionStatus, Weekday } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { FindWaitlistParams } from './dto/find-waitlist.params';

export type Period = 'morning' | 'afternoon' | 'evening';

export interface AvailabilityItem {
  weekDay: number;
  morning: boolean;
  afternoon: boolean;
  evening: boolean;
}

const WEEKDAY_NUM: Record<Weekday, number> = {
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

function periodOf(configStartHour: string): Period {
  const hour = parseInt(configStartHour.split(':')[0], 10);
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

// um ano atrás (mesma regra do dashboard.service pro treinamento válido)
function oneYearAgo(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 365);
  return d;
}

@Injectable()
export class WaitlistService {
  constructor(private readonly prisma: PrismaService) {}

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
        ...(filter.trainingValid && { lastTrainingDate: { gte: oneYearAgo() } }),
      },
      include: {
        petitions: { select: { createdAt: true } },
        congregation: { select: { id: true, name: true, city: true } },
        participantsGroup: { include: { group: { select: { type: true } } } },
      },
    });

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
          waitingSince: p.petitions!.createdAt,
          availability: (p.availability as unknown as AvailabilityItem[]) ?? [],
        };
      });

    const groupCards = groups
      .map((g) => {
        const weekdayNum = WEEKDAY_NUM[g.configWeekday];
        const period = periodOf(g.configStartHour);

        const candidates = withCapacity
          .filter((c) => {
            // regra de composição: 1 Centro (MAIN) + 1 adicional, ou 2 adicionais
            if (c.total >= 2) return false;
            if (g.type === GroupType.MAIN && c.mainCount > 0) return false;
            // disponibilidade no dia/período do grupo
            const match = c.availability.find((a) => a.weekDay === weekdayNum);
            return !!match && !!match[period];
          })
          .sort((a, b) => a.waitingSince.getTime() - b.waitingSince.getTime())
          .map((c) => ({
            participantId: c.participant.id,
            name: c.participant.name,
            sex: c.participant.sex,
            phone: c.participant.phone,
            profilePhoto: c.participant.profilePhoto,
            congregation: c.participant.congregation,
            availability: c.availability,
            waitingSince: c.waitingSince,
          }));

        const currentMembers = g.participantsGroup.length;
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
          needsHelp: currentMembers < g.configMin,
          candidates,
        };
      })
      .sort((a, b) => {
        const dayDiff = WEEKDAY_ORDER.indexOf(a.weekday) - WEEKDAY_ORDER.indexOf(b.weekday);
        if (dayDiff !== 0) return dayDiff;
        return a.configStartHour.localeCompare(b.configStartHour);
      });

    // total da lista de espera = pessoas distintas que aparecem em pelo menos 1 coluna
    const distinct = new Map<string, ParticipantSex>();
    for (const g of groupCards) {
      for (const c of g.candidates) distinct.set(c.participantId, c.sex);
    }
    const bySex = { MALE: 0, FEMALE: 0 };
    for (const sex of distinct.values()) bySex[sex]++;

    return {
      summary: {
        groupsNeedingHelp: groupCards.filter((g) => g.needsHelp).length,
        waitlistTotal: distinct.size,
        bySex,
      },
      groups: groupCards,
    };
  }
}
