import { Controller, Get, Param, ParseUUIDPipe, Query, UsePipes, ValidationPipe } from '@nestjs/common';

import { DesignationViewService } from './designation-view.service';
import { DesignationWriteService } from './designation-write.service';
import { DesignationHistoryQuery, WeekDesignationQuery } from './dto/find-designations-query.dto';

/**
 * Leitura de designação pelo grupo.
 *
 * Todas as três exigem token (na legacy, `authorizer: check-authorizer`) — só a
 * tela de volunteer é pública e ela usa as rotas de `/designations/:id/participants`.
 */
@Controller('groups')
export class GroupsDesignationsController {
  constructor(
    private readonly view: DesignationViewService,
    private readonly write: DesignationWriteService,
  ) {}

  /**
   * Designação da semana do grupo (a que está aberta).
   *
   * `?random=true` é o **sorteio** da escala — e é escrita, apesar de ser GET
   * (na legacy também era). Vai para `DesignationWriteService.randomize` por
   * isso; sem o param, aqui é só leitura.
   */
  @Get(':groupId/designations/week')
  @UsePipes(new ValidationPipe({ transform: true }))
  week(@Param('groupId', ParseUUIDPipe) groupId: string, @Query() query: WeekDesignationQuery) {
    return query.random ? this.write.randomize(groupId, query.filter) : this.view.findByGroupId(groupId, query.filter);
  }

  /** Cabeçalho da tela de designação: grupo, dia da semana e a designação atual. */
  @Get(':groupId/designations/week-details')
  weekDetails(@Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.view.findWeekDetails(groupId);
  }

  /** Últimas 10 designações do grupo, dentro do intervalo de datas. */
  @Get(':groupId/designations')
  @UsePipes(new ValidationPipe({ transform: true }))
  history(@Param('groupId', ParseUUIDPipe) groupId: string, @Query() query: DesignationHistoryQuery) {
    return this.view.findHistory(groupId, query.dateFrom, query.dateTo);
  }
}
