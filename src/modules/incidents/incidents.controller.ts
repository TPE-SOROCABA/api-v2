import { Controller, Get, Query, Request } from '@nestjs/common';
import { AuthenticatedRequest } from 'src/shared/types';
import { GroupScopeService } from 'src/shared/group-scope.service';
import { FindIncidentsParams } from './dto/find-incidents.params';
import { IncidentsService } from './incidents.service';

/**
 * Painel de faltas (ex-"Lista de Atenção" do Looker).
 * Escopo por grupo aplicado via GroupScopeService:
 * capitão só vê o(s) grupo(s) dele; coordenador/analista vê todos.
 */
@Controller('incidents')
export class IncidentsController {
  constructor(
    private readonly incidentsService: IncidentsService,
    private readonly groupScope: GroupScopeService,
  ) {}

  @Get()
  async findAll(@Request() req: AuthenticatedRequest, @Query() query: FindIncidentsParams) {
    const { groupIds } = await this.groupScope.resolveGroupFilter(req.user, query.groupId);
    return this.incidentsService.findAll({
      groupIds,
      participantName: query.participantName,
      participantId: query.participantId,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get('summary')
  async summary(@Request() req: AuthenticatedRequest, @Query() query: FindIncidentsParams) {
    const { groupIds } = await this.groupScope.resolveGroupFilter(req.user, query.groupId);
    return this.incidentsService.summary({
      groupIds,
      participantName: query.participantName,
    });
  }

  /** Saúde de faltas: média por grupo vs. média geral. */
  @Get('health')
  async health(@Request() req: AuthenticatedRequest, @Query() query: FindIncidentsParams) {
    const { groupIds } = await this.groupScope.resolveGroupFilter(req.user, query.groupId);
    return this.incidentsService.health({ groupIds });
  }
}
