import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CreatePointDto } from './dto/create-point.dto';
import { UpdatePointDto } from './dto/update-point.dto';
import { GroupPoint } from './interfaces/group-point.interface';
import { TransactionLogger } from '../../infra/transaction.logger';

@Injectable()
export class PointsService {
  private logger = new TransactionLogger(PointsService.name);

  constructor(private prisma: PrismaService) {}

  async getGroupPoints(groupId: string, userProfile?: string): Promise<{ success: boolean; data: GroupPoint[] }> {
    // Validação de autorização
    if (userProfile && userProfile !== 'COORDINATOR') {
      throw new ForbiddenException({
        success: false,
        error: 'Unauthorized',
        message: 'Apenas coordenadores podem acessar esta funcionalidade'
      });
    }

    try {
      // Verifica se o grupo existe
      const groupExists = await this.prisma.groups.findUnique({
        where: { id: groupId }
      });

      if (!groupExists) {
        throw new NotFoundException({
          success: false,
          error: 'Group not found',
          message: 'Grupo não encontrado'
        });
      }

      // Busca os pontos do grupo
      const pointPublicationCarts = await this.prisma.pointPublicationCart.findMany({
        where: { groupId },
        include: {
          point: true,
          publicationCarts: true
        }
      });

      const groupPoints: GroupPoint[] = pointPublicationCarts.map(ppc => ({
        id: ppc.id,
        pointId: ppc.pointId,
        pointName: ppc.point.name,
        cartName: ppc.publicationCarts.name,
        minParticipants: ppc.minParticipants,
        maxParticipants: ppc.maxParticipants,
        status: ppc.status,
        groupId: ppc.groupId,
        locationPhoto: ppc.point.locationPhoto
      }));

      this.logger.log(`Pontos do grupo ${groupId} encontrados: ${groupPoints.length} pontos`);
      return { success: true, data: groupPoints };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error(`Erro ao buscar pontos do grupo ${groupId}:`, error);
      throw new BadRequestException({
        success: false,
        error: 'Internal server error',
        message: 'Erro interno do servidor'
      });
    }
  }

  async createGroupPoint(groupId: string, createPointDto: CreatePointDto, userProfile?: string): Promise<{ success: boolean; data: GroupPoint }> {
    // Validação de autorização
    if (userProfile && userProfile !== 'COORDINATOR') {
      throw new ForbiddenException({
        success: false,
        error: 'Unauthorized',
        message: 'Apenas coordenadores podem acessar esta funcionalidade'
      });
    }

    // Validação personalizada para maxParticipants >= minParticipants
    if (createPointDto.maxParticipants < createPointDto.minParticipants) {
      throw new BadRequestException({
        success: false,
        error: 'Validation error',
        message: 'Dados inválidos',
        details: {
          maxParticipants: 'Quantidade máxima deve ser maior ou igual à mínima'
        }
      });
    }

    try {
      // Verifica se o grupo existe
      const groupExists = await this.prisma.groups.findUnique({
        where: { id: groupId }
      });

      if (!groupExists) {
        throw new NotFoundException({
          success: false,
          error: 'Group not found',
          message: 'Grupo não encontrado'
        });
      }

      // Executa em transação
      const result = await this.prisma.$transaction(async (tx) => {
        // Sempre cria um novo Point
        const point = await tx.point.create({
          data: {
            name: createPointDto.pointName,
            locationPhoto: null
          }
        });

        // Sempre cria um novo publicationCart
        const publicationCart = await tx.publicationCart.create({
          data: {
            name: createPointDto.cartName,
            description: `Carrinho de publicações: ${createPointDto.cartName}`
          }
        });

        // Cria o PointPublicationCart
        const pointPublicationCart = await tx.pointPublicationCart.create({
          data: {
            pointId: point.id,
            minParticipants: createPointDto.minParticipants,
            maxParticipants: createPointDto.maxParticipants,
            status: createPointDto.status,
            publicationCartId: publicationCart.id,
            groupId: groupId
          },
          include: {
            point: true,
            publicationCarts: true
          }
        });

        return {
          id: pointPublicationCart.id,
          pointId: pointPublicationCart.pointId,
          pointName: pointPublicationCart.point.name,
          cartName: pointPublicationCart.publicationCarts.name,
          minParticipants: pointPublicationCart.minParticipants,
          maxParticipants: pointPublicationCart.maxParticipants,
          status: pointPublicationCart.status,
          groupId: pointPublicationCart.groupId,
          locationPhoto: pointPublicationCart.point.locationPhoto
        };
      });

      this.logger.log(`Ponto criado para o grupo ${groupId}: ${result.pointName}`);
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Erro ao criar ponto para o grupo ${groupId}:`, error);
      throw new BadRequestException({
        success: false,
        error: 'Internal server error',
        message: 'Erro interno do servidor'
      });
    }
  }

  async updateGroupPoint(pointId: string, updatePointDto: UpdatePointDto, userProfile?: string): Promise<{ success: boolean; data: GroupPoint }> {
    // Validação de autorização
    if (userProfile && userProfile !== 'COORDINATOR') {
      throw new ForbiddenException({
        success: false,
        error: 'Unauthorized',
        message: 'Apenas coordenadores podem acessar esta funcionalidade'
      });
    }

    // Validação personalizada para maxParticipants >= minParticipants se ambos estiverem presentes
    if (updatePointDto.maxParticipants !== undefined && updatePointDto.minParticipants !== undefined) {
      if (updatePointDto.maxParticipants < updatePointDto.minParticipants) {
        throw new BadRequestException({
          success: false,
          error: 'Validation error',
          message: 'Dados inválidos',
          details: {
            maxParticipants: 'Quantidade máxima deve ser maior ou igual à mínima'
          }
        });
      }
    }

    try {
      // Busca o PointPublicationCart existente
      const existingPointPubCart = await this.prisma.pointPublicationCart.findUnique({
        where: { id: pointId },
        include: { point: true }
      });

      if (!existingPointPubCart) {
        throw new NotFoundException({
          success: false,
          error: 'Point not found',
          message: 'Ponto não encontrado'
        });
      }

      // Validação adicional se apenas um dos valores for fornecido
      const currentMin = updatePointDto.minParticipants ?? existingPointPubCart.minParticipants;
      const currentMax = updatePointDto.maxParticipants ?? existingPointPubCart.maxParticipants;

      if (currentMax < currentMin) {
        throw new BadRequestException({
          success: false,
          error: 'Validation error',
          message: 'Dados inválidos',
          details: {
            maxParticipants: 'Quantidade máxima deve ser maior ou igual à mínima'
          }
        });
      }

      // Executa em transação
      const result = await this.prisma.$transaction(async (tx) => {
        let updatedPointId = existingPointPubCart.pointId;
        let updatedPublicationCartId = existingPointPubCart.publicationCartId;

        // Atualiza o Point se o nome for alterado
        if (updatePointDto.pointName && updatePointDto.pointName !== existingPointPubCart.point.name) {
          // Verifica se existe outro ponto com o mesmo nome
          const existingPoint = await tx.point.findFirst({
            where: { 
              name: updatePointDto.pointName,
              id: { not: existingPointPubCart.pointId }
            }
          });

          if (existingPoint) {
            // Se existe, usa o ponto existente
            updatedPointId = existingPoint.id;
          } else {
            // Se não existe, cria um novo ponto
            const newPoint = await tx.point.create({
              data: {
                name: updatePointDto.pointName,
                locationPhoto: null
              }
            });
            updatedPointId = newPoint.id;
          }
        }

        // Cria novo carrinho se o nome do carrinho for fornecido
        if (updatePointDto.cartName) {
          // Verifica se existe um carrinho com o mesmo nome
          const existingCart = await tx.publicationCart.findFirst({
            where: { name: updatePointDto.cartName }
          });

          if (existingCart) {
            // Se existe, usa o carrinho existente
            updatedPublicationCartId = existingCart.id;
          } else {
            // Se não existe, cria um novo carrinho
            const newCart = await tx.publicationCart.create({
              data: {
                name: updatePointDto.cartName,
                description: `Carrinho de publicações: ${updatePointDto.cartName}`
              }
            });
            updatedPublicationCartId = newCart.id;
          }
        }

        // Atualiza o PointPublicationCart
        const updateData: any = {};
        if (updatedPointId !== existingPointPubCart.pointId) updateData.pointId = updatedPointId;
        if (updatedPublicationCartId !== existingPointPubCart.publicationCartId) updateData.publicationCartId = updatedPublicationCartId;
        if (updatePointDto.minParticipants !== undefined) updateData.minParticipants = updatePointDto.minParticipants;
        if (updatePointDto.maxParticipants !== undefined) updateData.maxParticipants = updatePointDto.maxParticipants;
        if (updatePointDto.status !== undefined) updateData.status = updatePointDto.status;

        const updatedPointPubCart = await tx.pointPublicationCart.update({
          where: { id: pointId },
          data: updateData,
          include: { 
            point: true,
            publicationCarts: true
          }
        });

        return {
          id: updatedPointPubCart.id,
          pointId: updatedPointPubCart.pointId,
          pointName: updatedPointPubCart.point.name,
          cartName: updatedPointPubCart.publicationCarts.name,
          minParticipants: updatedPointPubCart.minParticipants,
          maxParticipants: updatedPointPubCart.maxParticipants,
          status: updatedPointPubCart.status,
          groupId: updatedPointPubCart.groupId,
          locationPhoto: updatedPointPubCart.point.locationPhoto
        };
      });

      this.logger.log(`Ponto ${pointId} atualizado com sucesso`);
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Erro ao atualizar ponto ${pointId}:`, error);
      throw new BadRequestException({
        success: false,
        error: 'Internal server error',
        message: 'Erro interno do servidor'
      });
    }
  }

  async deleteGroupPoint(): Promise<{ success: boolean; error: string; message: string }> {
    // Método não implementado conforme especificação
    throw new BadRequestException({
      success: false,
      error: 'Method not allowed',
      message: 'Exclusão de pontos não é permitida (preservação de histórico)'
    });
  }
}