import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Post, Put, Request } from '@nestjs/common';
import { Public } from 'src/auth/public.decorator';
import { MaybeAuthenticatedRequest } from 'src/shared/types';
import { CreateIncidentDto, UpdateIncidentDto } from './dto/incident.dto';
import { IncidentsService } from './incidents.service';

/**
 * Faltas dentro de uma designação. Mesmo caminho da legacy de propósito: a migração no
 * front vira só trocar `endpoint` para "new", sem mudar URL nenhuma.
 *
 * POST/PUT são `@Public()` de propósito: o voluntário abre o link que chega no WhatsApp
 * numa tela sem login (`app/designacao/[designationId]/[participantId]`) e reporta a falta
 * de lá. A proteção é o par (designationId, participantId) da URL — os dois são UUID e
 * vêm do link. Quando houver token, o AuthGuard anexa em `request.user` e o voluntário vira
 * o reporter de verdade (foi assim na legacy: `getToken(event) ?? participantId`).
 *
 * DELETE exige token, como na legacy (lá tinha `check-authorizer`): só o capitão/coordenador
 * tira a falta que o voluntário registrou.
 */
@Controller('designations/:designationId/participants/:participantId/incidences')
export class DesignationIncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  create(@Param('designationId') designationId: string, @Param('participantId') participantId: string, @Body() body: CreateIncidentDto, @Request() req: MaybeAuthenticatedRequest) {
    return this.incidentsService.create(designationId, participantId, body.reason, req.user);
  }

  @Public()
  @Put(':incidentId')
  update(@Param('designationId') designationId: string, @Param('participantId') participantId: string, @Param('incidentId') incidentId: string, @Body() body: UpdateIncidentDto) {
    return this.incidentsService.update(designationId, participantId, incidentId, body);
  }

  @Delete(':incidentId')
  remove(@Param('designationId') designationId: string, @Param('participantId') participantId: string, @Param('incidentId') incidentId: string) {
    return this.incidentsService.remove(designationId, participantId, incidentId);
  }
}
