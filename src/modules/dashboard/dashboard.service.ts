import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { TransactionLogger } from 'src/infra/transaction.logger';
import { FindAllParams } from './dto/find-params.dto';
import { ParticipantSex, Petitions, PetitionStatus, Weekday } from '@prisma/client';
import { AvailabilityItem } from '../participants/dto/create-participant.dto';

const WEEKDAY = {
  [Weekday.SUNDAY]: 0,
  [Weekday.MONDAY]: 1,
  [Weekday.TUESDAY]: 2,
  [Weekday.WEDNESDAY]: 3,
  [Weekday.THURSDAY]: 4,
  [Weekday.FRIDAY]: 5,
  [Weekday.SATURDAY]: 6,
};

@Injectable()
export class DashboardService {
  private readonly logger = new TransactionLogger(DashboardService.name);
  constructor(private readonly prismaService: PrismaService) { }

  async getAllDashboard(params: FindAllParams) {
    const [groups, points, participantsGroups, incidents] = await Promise.all([
      this.prismaService.groups.findMany({
        select: {
          id: true,
          configWeekday: true,
          configMax: true,
          configStartHour: true,
          name: true,
        },
        ...(params.groupId && { where: { id: params.groupId } }),
      }),
      this.prismaService.pointPublicationCart.findMany({
        ...(params.groupId && { where: { groupId: params.groupId } }),
        select: {
          pointId: true,
        },
        distinct: ['pointId'],
      }),
      this.prismaService.participantsGroups.findMany({
        ...(params.groupId && { where: { groupId: params.groupId } }),
        include: {
          participant: true,
        },
      }),
      this.prismaService.incidentHistories.findMany({
        include: {
          participant: {
            select: {
              profilePhoto: true,
              name: true,
            },
          },
          designation: {
            include: {
              group: true,
            },
          },
        },
        ...(params.groupId && {
          where: {
            designation: {
              groupId: params.groupId,
            },
          },
        }),
      }),
    ]);
    const participants = participantsGroups.map((pg) => pg.participant);
    const participantsIncidents = incidents.reduce(
      (acc, incident) => {
        const participantId = incident.participantId;
        if (!acc[participantId]) {
          acc[participantId] = {
            profilePhoto: incident.participant.profilePhoto,
            name: incident.participant.name,
            count: 0,
          };
        }
        acc[participantId].count++;
        return acc;
      },
      {} as Record<string, { profilePhoto: string; name: string; count: number }>,
    );

    const petitions = await this.prismaService.$queryRaw<Petitions[]>`
            SELECT * 
            FROM "public"."participants" p
            INNER JOIN "public"."petitions" pt ON pt.id = p.petition_id
            WHERE EXISTS (
                SELECT 1
                FROM unnest(p."availability") AS elem
                WHERE (
                    (elem->>'evening')::boolean = true OR 
                    (elem->>'morning')::boolean = true OR 
                    (elem->>'afternoon')::boolean = true
                ) AND (elem->>'weekDay')::int = ANY(${groups.map((g) => WEEKDAY[g.configWeekday])}::int[])
            )`;

    const { averagePresence } = await this.getPresenceByGroup({ groupId: params.groupId });

    const participantsInGroup = await this.getParticipantsInGroup(params.groupId);

    const filteredPetitions = petitions.filter((petition: any) => {
      if (petition.status !== PetitionStatus.WAITING) return false;

      let matchedAt: string | undefined;

      const hasMatch = groups.some((group) => {
        const groupWeekday = WEEKDAY[group.configWeekday];
        const startHour = parseInt(group.configStartHour.split(':')[0], 10);

        let period: 'morning' | 'afternoon' | 'evening';
        if (startHour < 12) period = 'morning';
        else if (startHour < 18) period = 'afternoon';
        else period = 'evening';

        const availability = petition.availability as AvailabilityItem[];
        const dayAvailability = availability.find((a) => a.weekDay === groupWeekday);

        if (dayAvailability && dayAvailability[period] === true) {
          matchedAt = dayAvailability.updatedAt;
          return true;
        }
        return false;
      });

      if (hasMatch) {
        (petition as any).relevantUpdatedAt = matchedAt;
        return true;
      }
      return false;
    }).sort((a: any, b: any) => {
      const timeA = a.relevantUpdatedAt ? new Date(a.relevantUpdatedAt).getTime() : new Date(a.updated_at).getTime();
      const timeB = b.relevantUpdatedAt ? new Date(b.relevantUpdatedAt).getTime() : new Date(b.updated_at).getTime();
      return timeA - timeB;
    });

    return {
      waitingList: filteredPetitions.length,
      waiting: filteredPetitions.map((p: any) => ({
        name: p.name,
        updatedAt: new Date(p.relevantUpdatedAt || p.updated_at).toLocaleDateString('pt-BR'),
      })),
      groups: params?.groupId ? participantsInGroup : groups.length,
      points: points.length,
      averagePresence: Number(averagePresence.toFixed()),
      trainings: {
        valid: participants.filter((p) => {
          const trainingDate = p.lastTrainingDate;
          if (!trainingDate) return false;
          const trainingDateObj = new Date(trainingDate);
          const currentDate = new Date();
          const diffTime = Math.abs(currentDate.getTime() - trainingDateObj.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return diffDays <= 365;
        }).length,
        expired: participants.filter((p) => {
          const trainingDate = p.lastTrainingDate;
          if (!trainingDate) return true;
          const trainingDateObj = new Date(trainingDate);
          const currentDate = new Date();
          const diffTime = Math.abs(currentDate.getTime() - trainingDateObj.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return diffDays > 365;
        }).length,
      },
      participants: {
        [ParticipantSex.MALE]: participants.filter((p) => p.sex === ParticipantSex.MALE).length,
        [ParticipantSex.FEMALE]: participants.filter((p) => p.sex === ParticipantSex.FEMALE).length,
      },
      vacancies: groups.reduce((acc, group) => {
        const groupParticipants = participantsGroups.filter((pg) => pg.groupId === group.id);
        const groupVacancies = group.configMax - groupParticipants.length;
        return acc + (groupVacancies > 0 ? groupVacancies : 0);
      }, 0),
      incidents: Object.values(participantsIncidents)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };
  }

  async getPresenceByGroup({ groupId }: { groupId: string }) {
    const result = await this.prismaService.$queryRawUnsafe<{ averagePresence: number }[]>(
      `
        SELECT 
          ROUND(AVG(presence), 2) AS "averagePresence"
        FROM (
          SELECT 
            d.id AS designation_id,
            CASE 
              WHEN (COUNT(DISTINCT ap.id) + COUNT(DISTINCT ih.id)) = 0 THEN 0
              ELSE (COUNT(DISTINCT ap.id) * 100.0) / (COUNT(DISTINCT ap.id) + COUNT(DISTINCT ih.id))
            END AS presence
          FROM designations d
          LEFT JOIN assignments a ON a.designations_id = d.id
          LEFT JOIN assignments_participants ap ON ap.assignment_id = a.id
          LEFT JOIN incident_histories ih ON ih.designation_id = d.id
          WHERE ($1::text IS NULL OR d.group_id = $1::text)
          GROUP BY d.id
        ) AS sub;
      `,
      groupId,
    );

    const averagePresence = result[0]?.averagePresence ?? 0;
    return { averagePresence };
  }

  async getParticipantsInGroup(groupId: string) {
    if (!groupId) {
      return 0;
    }
    return this.prismaService.participantsGroups.count({
      where: {
        groupId,
      },
    });
  }
}
