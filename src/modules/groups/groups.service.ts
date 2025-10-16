import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { instanceToPlain } from 'class-transformer';
import { AdditionalInfoDto } from './dto/additional-info.dto';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class GroupsService {
    constructor(private readonly prisma: PrismaService) { }

    async create(createGroupDto: CreateGroupDto) {
        const additionalInfo = createGroupDto.additionalInfo ? instanceToPlain<AdditionalInfoDto>(createGroupDto.additionalInfo) : undefined;
        const coordinator = createGroupDto.coordinatorId ? { connect: { id: createGroupDto.coordinatorId } } : undefined;
        const group = await this.prisma.groups.create({
            data: {
                name: createGroupDto.name,
                configEndHour: createGroupDto.configEndHour,
                configMax: createGroupDto.configMax,
                configMin: createGroupDto.configMin,
                configStartHour: createGroupDto.configStartHour,
                configWeekday: createGroupDto.configWeekday,
                additionalInfo: additionalInfo,
                coordinator: coordinator,
                status: createGroupDto.status,
                type: createGroupDto.type,
            },
        });

        return this.findOne(group.id);
    }

    async findAll() {
        const groups = await this.prisma.groups.findMany({
            include: {
                participantsGroup: true,
            }
        });

        return groups.map(group => {
            const { participantsGroup, ...groupData } = group;
            return {
                ...groupData,
                participants: participantsGroup.length
            }
        }
        );
    }

    async findOne(id: string) {
        const group = await this.prisma.groups.findUnique({
            where: { id },
            include: {
                participantsGroup: true
            }
        });
        if (!group) {
            throw new NotFoundException(`Group with ID ${id} not found`);
        }
        const { participantsGroup, ...groupData } = group;
        return {
            ...groupData,
            participants: participantsGroup.length
        }
    }

    // UPDATE
    async update(id: string, updateGroupDto: UpdateGroupDto) {
        // Verifica se existe antes de atualizar
        await this.findOne(id);
        const additionalInfo = updateGroupDto.additionalInfo ? instanceToPlain<AdditionalInfoDto>(updateGroupDto.additionalInfo) : undefined;
        const coordinator = updateGroupDto.coordinatorId ? { connect: { id: updateGroupDto.coordinatorId } } : undefined;
        await this.prisma.groups.update({
            where: { id },
            data: {
                name: updateGroupDto.name,
                configEndHour: updateGroupDto.configEndHour,
                configMax: updateGroupDto.configMax,
                configMin: updateGroupDto.configMin,
                configStartHour: updateGroupDto.configStartHour,
                configWeekday: updateGroupDto.configWeekday,
                additionalInfo: additionalInfo,
                coordinator: coordinator,
                status: updateGroupDto.status,
                type: updateGroupDto.type,
            },
        });

        return this.findOne(id);
    }

    // DELETE
    async remove(id: string) {
        // Verifica se existe antes de remover
        await this.findOne(id);
        // fazer delete cascade

        return this.prisma.groups.delete({
            where: { id },
        });
    }

    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async handleCron() {
        console.log('Iniciando cron de verificação de grupos sem designações...');

        try {
            // Busca grupos que têm participantes mas não têm designações
            const groupsWithoutDesignations = await this.prisma.groups.findMany({
                include: {
                    participantsGroup: true,
                    designations: true,
                },
                where: {
                    participantsGroup: {
                        some: {} // Grupos que têm pelo menos um participante
                    },
                    designations: {
                        none: {} // Grupos que não têm nenhuma designação
                    },
                    status: 'OPEN', // Apenas grupos ativos
                    type: "ADDITIONAL"
                }
            });

            console.log(`Encontrados ${groupsWithoutDesignations.length} grupos sem designações`);

            if (groupsWithoutDesignations.length === 0) {
                console.log('Nenhum grupo encontrado para processar');
                return;
            }

            // Processa cada grupo em uma transação separada
            for (const group of groupsWithoutDesignations) {
                await this.createDesignationForGroup(group);
            }

            console.log('Cron finalizada com sucesso');
        } catch (error) {
            console.error('Erro durante execução da cron:', error);
        }
    }

    async createDesignationForGroup(group: any) {
        const groupId = group.id;
        const groupName = group.name;

        console.log(`Processando grupo: ${groupName} (${groupId})`);

        try {
            await this.prisma.$transaction(async (prisma) => {
                // 1. Criar 9 pontos genéricos de uma vez
                const pointsData = Array.from({ length: 9 }, (_, i) => ({
                    name: `Ponto ${i + 1} - ${groupName}`,
                    locationPhoto: null
                }));

                const createdPoints = await prisma.point.createManyAndReturn({
                    data: pointsData
                });

                console.log(`Criados ${createdPoints.length} pontos para o grupo ${groupName}`);

                // 2. Criar 9 carrinhos genéricos de uma vez
                const cartsData = Array.from({ length: 9 }, (_, i) => ({
                    name: `${i + 1}`,
                    description: `Carrinho genérico ${i + 1} para o grupo ${groupName}`,
                    themePhoto: null
                }));

                const createdCarts = await prisma.publicationCart.createManyAndReturn({
                    data: cartsData
                });

                console.log(`Criados ${createdCarts.length} carrinhos para o grupo ${groupName}`);

                // 3. Criar associações entre pontos, carrinhos e grupo de uma vez
                const pointCartAssociations = createdPoints.map((point, i) => ({
                    pointId: point.id,
                    publicationCartId: createdCarts[i].id,
                    groupId: groupId,
                    minParticipants: 2,
                    maxParticipants: 3,
                    status: true
                }));

                await prisma.pointPublicationCart.createMany({
                    data: pointCartAssociations
                });

                console.log(`Criadas ${pointCartAssociations.length} associações ponto-carrinho-grupo`);

                // 4. Criar a designação
                const designation = await prisma.designations.create({
                    data: {
                        groupId: groupId,
                        name: `Designação Automática - ${groupName}`,
                        status: 'OPEN',
                        mandatoryPresence: true,
                        designationDate: new Date(),
                        designationEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // +7 dias
                    }
                });

                console.log(`Designação criada: ${designation.name} (${designation.id})`);

                // 5. Criar assignments de uma vez
                const assignmentsData = createdPoints.map(point => ({
                    pointId: point.id,
                    designationsId: designation.id,
                    config_min: group.configMin || 2,
                    config_max: group.configMax || 3,
                    config_status: true
                }));

                const createdAssignments = await prisma.assignments.createManyAndReturn({
                    data: assignmentsData
                });

                // 6. Criar associações assignment-carrinho de uma vez
                const assignmentCartData = createdAssignments.map((assignment, i) => ({
                    assignmentId: assignment.id,
                    publicationCartId: createdCarts[i].id
                }));

                await prisma.assignmentsPublicationCart.createMany({
                    data: assignmentCartData
                });

                console.log(`Criados ${createdPoints.length} assignments para a designação`);
            }, {
                timeout: 60000 // 60 segundos de timeout para transações longas
            });

            console.log(`Grupo ${groupName} processado com sucesso!`);
        } catch (error) {
            console.error(`Erro ao processar grupo ${groupName}:`, error);
            throw error;
        }
    }
}
