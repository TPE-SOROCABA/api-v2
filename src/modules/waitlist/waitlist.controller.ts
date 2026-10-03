import { Body, Controller, ForbiddenException, Get, Param, Put, Query, Request } from '@nestjs/common';
import { AuthenticatedRequest } from 'src/shared/types';
import { FindWaitlistParams } from './dto/find-waitlist.params';
import { WaitlistService } from './waitlist.service';

/**
 * "Lista de espera": voluntários ainda colocáveis, organizados por grupo/dia,
 * respeitando a regra de composição (1 Centro + 1 adicional, ou 2 adicionais).
 * Acesso: só COORDINATOR (decisão de produto — não é ADMIN_ANALYST nem capitão).
 */
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Get()
  async findAll(@Request() req: AuthenticatedRequest, @Query() query: FindWaitlistParams) {
    if (req.user.profile !== 'COORDINATOR') {
      throw new ForbiddenException('Lista de espera é restrita ao coordenador');
    }
    return this.waitlistService.getWaitlist(query);
  }

  // reordena a coluna de um grupo (quem vem primeiro na fila). Lista vazia = volta à ordem por data
  @Put('order/:groupId')
  async setOrder(@Request() req: AuthenticatedRequest, @Param('groupId') groupId: string, @Body() body: { participantIds?: unknown }) {
    if (req.user.profile !== 'COORDINATOR') {
      throw new ForbiddenException('Lista de espera é restrita ao coordenador');
    }
    return this.waitlistService.setOrder(groupId, body?.participantIds);
  }
}
