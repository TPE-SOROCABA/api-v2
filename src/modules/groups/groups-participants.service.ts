import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GroupType, ParticipantSex, PetitionStatus } from '@prisma/client';
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
        this.logger.debug(`Iniciando busca de todos os participantes do grupo com ID ${id}`);
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
        this.logger.debug(`Consulta ao banco de dados para grupo com ID ${id} concluída`);
        if (!group) {
            this.logger.warn(`Grupo com ID ${id} não encontrado`);
            throw new NotFoundException(`Group with ID ${id} not found`);
        }
        this.logger.debug(`Grupo com ID ${id} encontrado: ${JSON.stringify(group)}`);
        const { participantsGroup, ...groupData } = group;
        const participants = participantsGroup.map(participantGroup => ({
            ...participantGroup.participant,
            profile: participantGroup.profile,
        }));
        this.logger.debug(`Participantes processados: ${JSON.stringify(participants)}`);
        return {
            ...groupData,
            participants
        };
    }

    async updateParticipantGroup(groupId: string, participantId: string) {
        this.logger.debug(`Iniciando atualização do grupo ${groupId} com participante ${participantId}`);
        const { group, participant } = await this.getGroupAndParticipant(groupId, participantId);
        this.logger.debug(`Grupo e participante carregados: ${JSON.stringify(group)}, ${JSON.stringify(participant)}`);

        const isParticipantInGroup = group.participantsGroup.some(participantGroup => participantGroup.participantId === participant.id);
        this.logger.debug(`Verificação se participante já está no grupo: ${isParticipantInGroup}`);
        if (isParticipantInGroup) {
            this.logger.warn(`Participante ${participant.name} já está no grupo ${group.name}`);
            throw new ConflictException(`Participante ${participant.name} já está no grupo ${group.name}`);
        }

        const isParticipantInAnotherGroupType = participant.participantsGroup.some(participantGroup => participantGroup.group.type === group.type);
        this.logger.debug(`Verificação se participante já está em outro grupo do mesmo tipo: ${isParticipantInAnotherGroupType}`);
        if (isParticipantInAnotherGroupType) {
            this.logger.warn(`Participante ${participant.name} já está em um grupo do tipo ${GroupTypePtBr[group.type]}`);
            throw new ConflictException(`Participante ${participant.name} já está em um grupo do tipo ${GroupTypePtBr[group.type]}`);
        }

        if (group.participantsGroup.length >= group.configMax) {
            this.logger.warn(`Grupo ${group.name} já atingiu o limite de participantes`);
            throw new ConflictException(`Grupo ${group.name} já atingiu o limite de participantes`);
        }

        this.logger.debug(`Criando relação entre grupo e participante no banco de dados`);
        await this.prisma.participantsGroups.create({
            data: {
                groupId: group.id,
                participantId: participant.id
            }
        });

        this.logger.debug(`Atualizando status da petição do participante para ACTIVE`);
        await this.prisma.petitions.update({
            where: { id: participant.petitionId },
            data: {
                status: PetitionStatus.ACTIVE,
            }
        });

        this.logger.log(`Participante ${participant.name} atribuído ao grupo ${group.name}`);
        return {
            message: `Participante ${participant.name} atribuido ao grupo ${group.name}`
        };
    }

    async removeParticipantGroup(groupId: string, participantId: string) {
        this.logger.debug(`Iniciando remoção do participante ${participantId} do grupo ${groupId}`);
        const { group, participant } = await this.getGroupAndParticipant(groupId, participantId);
        this.logger.debug(`Grupo e participante carregados: ${JSON.stringify(group)}, ${JSON.stringify(participant)}`);

        const isParticipantInGroup = group.participantsGroup.some(participantGroup => participantGroup.participantId === participant.id);
        this.logger.debug(`Verificação se participante está no grupo: ${isParticipantInGroup}`);
        if (!isParticipantInGroup) {
            this.logger.warn(`Participante ${participant.name} não está no grupo ${group.name}`);
            throw new NotFoundException(`Participante ${participant.name} não está no grupo ${group.name}`);
        }

        this.logger.debug(`Removendo relação entre grupo e participante no banco de dados`);
        await this.prisma.participantsGroups.deleteMany({
            where: {
                groupId: group.id,
                participantId: participant.id
            }
        });

        const participantGroups = await this.prisma.participantsGroups.findMany({
            where: {
                participantId: participant.id
            }
        });
        this.logger.debug(`Verificando se participante ainda está em outros grupos: ${participantGroups.length}`);
        if (participantGroups.length === 0 && participant['petitionId']) {
            this.logger.debug(`Atualizando status da petição do participante para WAITING`);
            await this.prisma.petitions.update({
                where: { id: participant.petitionId },
                data: {
                    status: PetitionStatus.WAITING,
                }
            })
        }

        this.logger.log(`Participante ${participant.name} removido do grupo ${group.name}`);
        return {
            message: `Participante ${participant.name} removido do grupo ${group.name}`
        };
    }

    async updateParticipantGroupProfile(groupId: string, participantId: string, { profile }: UpdateGroupParticipanteProfileDto) {
        this.logger.debug(`Iniciando atualização do perfil do participante ${participantId} no grupo ${groupId}`);
        const groupParticipant = await this.prisma.participantsGroups.findFirst({
            where: {
                participantId,
                groupId
            },
            include: {
                participant: true,
                group: true
            }
        });
        this.logger.debug(`Relação entre grupo e participante carregada: ${JSON.stringify(groupParticipant)}`);

        if (!groupParticipant) {
            this.logger.warn(`Participante não está no grupo`);
            throw new NotFoundException(`Participante não está no grupo`);
        }

        if (groupParticipant.participant.sex !== ParticipantSex.MALE) {
            this.logger.warn(`Participante não é do sexo masculino`);
            throw new BadRequestException(`Participante não é do sexo masculino`);
        }

        this.logger.debug(`Atualizando perfil do participante no banco de dados`);
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
            this.prisma.participants.findUnique({ where: { id: participantId }, include: { participantsGroup: { include: { group: true } }, petitions: true } })
        ]);
        this.logger.debug(`Dados carregados do banco de dados: grupo=${JSON.stringify(group)}, participante=${JSON.stringify(participant)}`);

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
