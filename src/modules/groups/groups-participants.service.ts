import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GroupType } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { UpdateGroupParticipanteProfileDto } from './dto/update-group-participante-profile.dto';

const GroupTypePtBr = {
    [GroupType.MAIN]: 'Principal',
    [GroupType.ADDITIONAL]: 'Adicional',
    [GroupType.SPECIAL]: 'Especial'
}

@Injectable()
export class GroupsParticipantsService {
    logger = new Logger(GroupsParticipantsService.name);
    constructor(private readonly prisma: PrismaService) { }

    async findAllParticipants(id: string) {
        this.logger.debug(`Procurando todos os participantes do grupo com ID ${id}`);
        const group = await this.prisma.groups.findUnique({
            where: { id },
            include: {
                participantsGroup: {
                    include: {
                        participant: true
                    }
                }
            }
        });
        if (!group) {
            this.logger.warn(`Grupo com ID ${id} não encontrado`);
            throw new NotFoundException(`Group with ID ${id} not found`);
        }
        const { participantsGroup, ...groupData } = group;
        return {
            ...groupData,
            participants: participantsGroup.map(participantGroup => ({
                ...participantGroup.participant,
                profile: participantGroup.profile,
            }))
        }
    }

    async updateParticipantGroup(groupId: string, participantId: string) {
        this.logger.debug(`Atualizando grupo ${groupId} com participante ${participantId}`);
        const { group, participant } = await this.getGroupAndParticipant(groupId, participantId);

        const isParticipantInGroup = group.participantsGroup.some(participantGroup => participantGroup.participantId === participant.id);
        if (isParticipantInGroup) {
            this.logger.warn(`Participante ${participant.name} já está no grupo ${group.name}`);
            throw new ConflictException(`Participante ${participant.name} já está no grupo ${group.name}`);
        }

        const isParticipantInAnotherGroupType = participant.participantsGroup.some(participantGroup => participantGroup.group.type === group.type);
        if (isParticipantInAnotherGroupType) {
            this.logger.warn(`Participante ${participant.name} já está em um grupo do tipo ${GroupTypePtBr[group.type]}`);
            throw new ConflictException(`Participante ${participant.name} já está em um grupo do tipo ${GroupTypePtBr[group.type]}`);
        }

        if (group.participantsGroup.length >= group.configMax) {
            this.logger.warn(`Grupo ${group.name} já atingiu o limite de participantes`);
            throw new ConflictException(`Grupo ${group.name} já atingiu o limite de participantes`);
        }

        await this.prisma.participantsGroups.create({
            data: {
                groupId: group.id,
                participantId: participant.id
            }
        });

        this.logger.log(`Participante ${participant.name} atribuído ao grupo ${group.name}`);
        return {
            message: `Participante ${participant.name} atribuido ao grupo ${group.name}`
        };
    }

    async removeParticipantGroup(groupId: string, participantId: string) {
        this.logger.debug(`Removendo participante ${participantId} do grupo ${groupId}`);
        const { group, participant } = await this.getGroupAndParticipant(groupId, participantId);

        const isParticipantInGroup = group.participantsGroup.some(participantGroup => participantGroup.participantId === participant.id);
        if (!isParticipantInGroup) {
            this.logger.warn(`Participante ${participant.name} não está no grupo ${group.name}`);
            throw new NotFoundException(`Participante ${participant.name} não está no grupo ${group.name}`);
        }

        await this.prisma.participantsGroups.deleteMany({
            where: {
                groupId: group.id,
                participantId: participant.id
            }
        });

        this.logger.log(`Participante ${participant.name} removido do grupo ${group.name}`);
        return {
            message: `Participante ${participant.name} removido do grupo ${group.name}`
        };
    }

    async updateParticipantGroupProfile(groupId: string, participantId: string, { profile }: UpdateGroupParticipanteProfileDto) {
        this.logger.debug(`Atualizando perfil do participante ${participantId} no grupo ${groupId}`);
        const groupParticipant = await this.prisma.participantsGroups.findFirst({
            where: {
                participantId,
                groupId
            },
            include: {
                participant: true,
                group: true
            }
        })

        if (!groupParticipant) {
            this.logger.warn(`Participante não está no grupo`);
            throw new NotFoundException(`Participante não está no grupo`);
        }

        await this.prisma.participantsGroups.update({
            where: {
                id: groupParticipant.id
            },
            data: {
                profile
            }
        });

        this.logger.log(`Perfil do participante ${groupParticipant.participant.name} atualizado para ${profile} no grupo ${groupParticipant.group.name}`);
        return {
            message: `Perfil do participante ${groupParticipant.participant.name} atualizado para ${profile} no grupo ${groupParticipant.group.name}`
        };
    }

    private async getGroupAndParticipant(groupId: string, participantId: string) {
        this.logger.debug(`Buscando grupo ${groupId} e participante ${participantId}`);
        const [group, participant] = await Promise.all([
            this.prisma.groups.findUnique({ where: { id: groupId }, include: { participantsGroup: true } }),
            this.prisma.participants.findUnique({ where: { id: participantId }, include: { participantsGroup: { include: { group: true } } } })
        ]);

        if (!group) {
            this.logger.warn(`Grupo com ID ${groupId} não encontrado`);
            throw new NotFoundException(`Group with ID ${groupId} not found`);
        }

        if (!participant) {
            this.logger.warn(`Participante com ID ${participantId} não encontrado`);
            throw new NotFoundException(`Participant with ID ${participantId} not found`);
        }

        return {
            group,
            participant
        };
    }
}
