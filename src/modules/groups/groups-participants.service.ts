import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GroupType, ParticipantSex, PetitionStatus } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { UpdateGroupParticipanteProfileDto } from './dto/update-group-participante-profile.dto';
import { AuditAction, AuditService } from '../audit/audit.service';
import { JwtPayload } from 'src/shared/types';

@Injectable()
export class GroupsParticipantsService {
    logger = new Logger(GroupsParticipantsService.name);
    constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) { }

    async findAllParticipants(id: string) {
        this.logger.debug(`Iniciando busca de todos os participantes do grupo com ID ${id}`);
        const group = await this.prisma.groups.findUnique({
            where: { id },
            include: {
                participantsGroup: {
                    include: {
                        participant: {
                            include: {
                                congregation: true,
                            }
                        }
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

    async updateParticipantGroup(groupId: string, participantId: string, actor?: JwtPayload) {
        this.logger.debug(`Iniciando atualização do grupo ${groupId} com participante ${participantId}`);
        const { group, participant } = await this.getGroupAndParticipant(groupId, participantId);
        this.logger.debug(`Grupo e participante carregados: ${JSON.stringify(group)}, ${JSON.stringify(participant)}`);

        const isParticipantInGroup = group.participantsGroup.some(participantGroup => participantGroup.participantId === participant.id);
        this.logger.debug(`Verificação se participante já está no grupo: ${isParticipantInGroup}`);
        if (isParticipantInGroup) {
            this.logger.warn(`Participante ${participant.name} já está no grupo ${group.name}`);
            throw new ConflictException(`Participante ${participant.name} já está no grupo ${group.name}`);
        }

        this.assertGroupComposition(group, participant.participantsGroup.map(pg => pg.group), participant.name);

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

        if (participant['petitionId']) {
            this.logger.debug(`Atualizando status da petição do participante para ACTIVE`);
            await this.prisma.petitions.update({
                where: { id: participant.petitionId },
                data: {
                    status: PetitionStatus.ACTIVE,
                }
            });
        }

        this.logger.log(`Participante ${participant.name} atribuído ao grupo ${group.name}`);
        await this.audit.log({
            actor,
            action: AuditAction.GROUP_JOIN,
            entity: 'participant',
            entityId: participant.id,
            entityName: participant.name,
            metadata: { groupId: group.id, groupName: group.name, groupType: group.type },
        });
        return {
            message: `Participante ${participant.name} atribuido ao grupo ${group.name}`
        };
    }

    async removeParticipantGroup(groupId: string, participantId: string, actor?: JwtPayload) {
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
        await this.audit.log({
            actor,
            action: AuditAction.GROUP_LEAVE,
            entity: 'participant',
            entityId: participant.id,
            entityName: participant.name,
            metadata: { groupId: group.id, groupName: group.name, groupType: group.type },
        });
        return {
            message: `Participante ${participant.name} removido do grupo ${group.name}`
        };
    }

    async updateParticipantGroupProfile(groupId: string, participantId: string, { profile }: UpdateGroupParticipanteProfileDto, actor?: JwtPayload) {
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
        const previousProfile = groupParticipant.profile;
        await this.prisma.participantsGroups.update({
            where: {
                id: groupParticipant.id
            },
            data: {
                profile
            }
        });

        this.logger.log(`Perfil do participante ${groupParticipant.participant.name} atualizado para ${profile} no grupo ${groupParticipant.group.name}`);
        await this.audit.log({
            actor,
            action: AuditAction.GROUP_ROLE_CHANGE,
            entity: 'participant',
            entityId: groupParticipant.participant.id,
            entityName: groupParticipant.participant.name,
            metadata: { groupId: groupParticipant.group.id, groupName: groupParticipant.group.name, from: previousProfile, to: profile },
        });
        return {
            message: `Perfil do participante ${groupParticipant.participant.name} atualizado para ${profile} no grupo ${groupParticipant.group.name}`
        };
    }

    /**
     * Regra de composição: no máximo 2 grupos (Centro/Adicional), sendo no máximo 1 do Centro
     * (1 Centro + 1 Adicional, ou 2 Adicionais). Grupo Especial não conta. `currentGroups` são os
     * grupos que a pessoa terá ANTES de entrar em `group`.
     */
    private assertGroupComposition(group: { type: GroupType }, currentGroups: { type: GroupType }[], participantName: string) {
        if (group.type === GroupType.SPECIAL) return;

        const nonSpecialGroups = currentGroups.filter(g => g.type !== GroupType.SPECIAL);
        this.logger.debug(`Quantidade de grupos (Principal/Adicional) que o participante já pertence: ${nonSpecialGroups.length}`);
        if (nonSpecialGroups.length >= 2) {
            this.logger.warn(`Participante ${participantName} já atingiu o limite de 2 grupos (Principal/Adicional)`);
            throw new ConflictException(`Participante ${participantName} já atingiu o limite de 2 grupos (Principal/Adicional)`);
        }

        if (group.type === GroupType.MAIN && nonSpecialGroups.some(g => g.type === GroupType.MAIN)) {
            this.logger.warn(`Participante ${participantName} já está em um grupo Centro e não pode entrar em outro`);
            throw new ConflictException(`Participante ${participantName} já está em um grupo Centro e não pode entrar em outro grupo Centro`);
        }
    }

    /**
     * Troca de grupo numa operação só: sai de `fromGroupId` e entra em `toGroupId`. Tudo é validado
     * ANTES (composição calculada sobre o que sobra depois de sair, vaga no destino), e a saída + a
     * entrada rodam numa transação: ou acontecem as duas, ou nenhuma (a pessoa nunca fica sem grupo).
     */
    async transferParticipant(fromGroupId: string, toGroupId: string, participantId: string, actor?: JwtPayload) {
        if (fromGroupId === toGroupId) {
            throw new BadRequestException('O grupo de origem e o de destino são o mesmo');
        }
        const { group: toGroup, participant } = await this.getGroupAndParticipant(toGroupId, participantId);

        const fromMembership = participant.participantsGroup.find(pg => pg.groupId === fromGroupId);
        if (!fromMembership) {
            throw new NotFoundException(`Participante ${participant.name} não está no grupo de origem`);
        }
        if (toGroup.participantsGroup.some(pg => pg.participantId === participant.id)) {
            throw new ConflictException(`Participante ${participant.name} já está no grupo ${toGroup.name}`);
        }

        const remainingGroups = participant.participantsGroup.filter(pg => pg.groupId !== fromGroupId).map(pg => pg.group);
        this.assertGroupComposition(toGroup, remainingGroups, participant.name);

        if (toGroup.participantsGroup.length >= toGroup.configMax) {
            throw new ConflictException(`Grupo ${toGroup.name} já atingiu o limite de participantes`);
        }

        await this.prisma.$transaction([
            this.prisma.participantsGroups.deleteMany({ where: { groupId: fromGroupId, participantId: participant.id } }),
            this.prisma.participantsGroups.create({ data: { groupId: toGroup.id, participantId: participant.id } }),
        ]);

        const fromGroup = fromMembership.group;
        this.logger.log(`Participante ${participant.name} trocado do grupo ${fromGroup.name} para ${toGroup.name}`);
        await this.audit.log({
            actor,
            action: AuditAction.GROUP_TRANSFER,
            entity: 'participant',
            entityId: participant.id,
            entityName: participant.name,
            metadata: { fromGroupId, fromGroupName: fromGroup.name, toGroupId: toGroup.id, toGroupName: toGroup.name },
        });
        return { message: `Participante ${participant.name} trocado de ${fromGroup.name} para ${toGroup.name}` };
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
