import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/infra/prisma/prisma.service";
import { TransactionLogger } from "src/infra/transaction.logger";
import { FindAllParams } from "./dto/find-params.dto";
import { ParticipantSex, Petitions, PetitionStatus, Weekday } from "@prisma/client";

const WEEKDAY = {
    [Weekday.SUNDAY]: 0,
    [Weekday.MONDAY]: 1,
    [Weekday.TUESDAY]: 2,
    [Weekday.WEDNESDAY]: 3,
    [Weekday.THURSDAY]: 4,
    [Weekday.FRIDAY]: 5,
    [Weekday.SATURDAY]: 6,
}

@Injectable()
export class DashboardService {
    private readonly logger = new TransactionLogger(DashboardService.name);
    constructor(
        private readonly prismaService: PrismaService,
    ) { }

    async getAllDashboard(params: FindAllParams) {
        const [groups, points, participants, incidents] = await Promise.all([
            this.prismaService.groups.findMany({
                select: {
                    id: true,
                    configWeekday: true,
                    configMax: true,
                },
                ...(params.groupId && { where: { id: params.groupId } }),
            }),
            this.prismaService.pointPublicationCart.findMany({
                ...(params.groupId && { where: { id: params.groupId } }),
                select: {
                    pointId: true,
                },
                distinct: ['pointId'],
            }),
            this.prismaService.participants.findMany({
                include: {
                    participantsGroup: {
                        ...(params.groupId && { where: { id: params.groupId } }),
                    }
                }
            }),
            this.prismaService.incidentHistories.findMany({
                include: {
                    participant: {
                        select: {
                            profilePhoto: true,
                            name: true,
                        }
                    },
                    designation: {
                        include: {
                            group: true,
                        }
                    },
                },
                ...(params.groupId && {
                    where: {
                        designation: {
                            groupId: params.groupId
                        }
                    },
                }),

            })
        ]);
        const participantsIncidents = incidents.reduce((acc, incident) => {
            const participantId = incident.participantId
            if (!acc[participantId]) {
                acc[participantId] = {
                    profilePhoto: incident.participant.profilePhoto,
                    name: incident.participant.name,
                    count: 0,
                };
            }
            acc[participantId].count++;
            return acc;
        }, {} as Record<string, { profilePhoto: string, name: string; count: number }>);

        const petitions = await this.prismaService.$queryRaw<
            Petitions[]
        >`  
            SELECT pt.* 
            FROM "public"."participants" p
            INNER JOIN "public"."petitions" pt ON pt.id = p.petition_id
            WHERE EXISTS (
                SELECT 1
                FROM unnest(p."availability") AS elem
                WHERE (elem->>'weekDay')::int = ANY(${groups.map(g => WEEKDAY[g.configWeekday])}::int[])
            )`;

        const designation = await this.prismaService.designations.findMany({
            where: {
                groupId: {
                    in: groups.map(g => g.id)
                }
            },
            include: {
                group: true,
                incidentHistories: {
                    include: {
                        participant: true,
                    }
                }
            }
        });

        const totalDesignations = designation.length;
        const totalIncidents = designation.reduce((acc, curr) => {
            const groupIncidents = curr.incidentHistories.length;
            return acc + groupIncidents;
        }, 0);
        const averagePresence = totalDesignations > 0 ? (totalIncidents / totalDesignations) * 100 : 0;

        return {
            waitingList: petitions.filter((p) => p.status === PetitionStatus.WAITING).length,
            groups: groups.length,
            points: points.length,
            averagePresence: Number(averagePresence.toFixed()),
            participants: {
                [ParticipantSex.MALE]: participants.filter(p => p.sex === ParticipantSex.MALE).length,
                [ParticipantSex.FEMALE]: participants.filter(p => p.sex === ParticipantSex.FEMALE).length
            },
            vacancies: groups.reduce((acc, group) => {
                const groupParticipants = participants.filter(p => p.participantsGroup.some(pg => pg.groupId === group.id));
                const groupVacancies = group.configMax - groupParticipants.length;
                return acc + (groupVacancies > 0 ? groupVacancies : 0);
            }, 0),
            incidents: Object.values(participantsIncidents).sort((a, b) => b.count - a.count).slice(0, 10)
        }
    }
}
