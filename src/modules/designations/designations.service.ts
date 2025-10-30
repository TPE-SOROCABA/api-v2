import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { TransactionLogger } from 'src/infra/transaction.logger';

@Injectable()
export class DesignationsService {
    private readonly logger = new TransactionLogger(DesignationsService.name);

    constructor(private readonly prisma: PrismaService) { }

    async remove(id: string): Promise<{ message: string }> {
        try {
            this.logger.log(`Iniciando exclusão da designação: ${id}`);

            // Verificar se a designação existe
            const designation = await this.prisma.designations.findUnique({
                where: { id },
                include: {
                    group: {
                        select: {
                            id: true,
                            name: true
                        }
                    },
                    assignments: {
                        include: {
                            assignmentsParticipants: true,
                            assignmentsPublicationCart: true
                        }
                    },
                    incidentHistories: true
                }
            });

            if (!designation) {
                throw new NotFoundException({
                    success: false,
                    error: 'Not found',
                    message: 'Designação não encontrada'
                });
            }

            // Log de informações sobre o que será removido
            const participantsCount = designation.assignments.reduce(
                (total, assignment) => total + assignment.assignmentsParticipants.length, 0
            );
            const incidentsCount = designation.incidentHistories.length;
            const assignmentsCount = designation.assignments.length;

            this.logger.log(`Preparando exclusão cascade:`);
            this.logger.log(`- Assignments: ${assignmentsCount}`);
            this.logger.log(`- Participantes vinculados: ${participantsCount}`);
            this.logger.log(`- Históricos de incidentes: ${incidentsCount}`);

            // Executar exclusão cascade em transação
            await this.prisma.$transaction(async (prisma) => {
                // 1. Remover assignments_participants (participantes dos assignments)
                for (const assignment of designation.assignments) {
                    if (assignment.assignmentsParticipants.length > 0) {
                        await prisma.assignmentsParticipants.deleteMany({
                            where: { assignmentId: assignment.id }
                        });
                        this.logger.log(`Removidos ${assignment.assignmentsParticipants.length} participantes do assignment ${assignment.id}`);
                    }
                }

                // 2. Remover assignments_publication_carts
                for (const assignment of designation.assignments) {
                    if (assignment.assignmentsPublicationCart.length > 0) {
                        await prisma.assignmentsPublicationCart.deleteMany({
                            where: { assignmentId: assignment.id }
                        });
                        this.logger.log(`Removidos ${assignment.assignmentsPublicationCart.length} carrinhos do assignment ${assignment.id}`);
                    }
                }

                // 4. Remover assignments
                if (designation.assignments.length > 0) {
                    await prisma.assignments.deleteMany({
                        where: { designationsId: id }
                    });
                    this.logger.log(`Removidos ${designation.assignments.length} assignments`);
                }

                // 5. Remover históricos de incidentes
                if (designation.incidentHistories.length > 0) {
                    await prisma.incidentHistories.deleteMany({
                        where: { designationId: id }
                    });
                    this.logger.log(`Removidos ${designation.incidentHistories.length} históricos de incidentes`);
                }

                // 9. Remover a designação
                await prisma.designations.delete({
                    where: { id }
                });
                this.logger.log(`Designação ${designation.name} removida`);
            }, {
                timeout: 60000
            });

            this.logger.log(`Designação excluída com sucesso: ${designation.name} (${id})`);

            return {
                message: `Designação "${designation.name}" do grupo "${designation.group.name}" foi excluída com sucesso`
            };

        } catch (error) {
            this.logger.error(`Erro ao excluir designação ${id}:`, error);

            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }

            throw new BadRequestException({
                success: false,
                error: 'Internal server error',
                message: 'Erro interno do servidor ao excluir designação'
            });
        }
    }

    async findOne(id: string) {
        const designation = await this.prisma.designations.findUnique({
            where: { id },
            include: {
                group: {
                    select: {
                        id: true,
                        name: true
                    }
                },
                assignments: {
                    include: {
                        point: true,
                        assignmentsParticipants: {
                            include: {
                                participant: {
                                    select: {
                                        id: true,
                                        name: true,
                                        phone: true,
                                        email: true
                                    }
                                }
                            }
                        },
                        assignmentsPublicationCart: {
                            include: {
                                publicationCart: true
                            }
                        }
                    }
                },
                incidentHistories: true
            }
        });

        if (!designation) {
            throw new NotFoundException({
                success: false,
                error: 'Not found',
                message: 'Designação não encontrada'
            });
        }

        return designation;
    }
}