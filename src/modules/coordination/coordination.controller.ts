import { Body, Controller, Get, Param, Patch, Query, Request } from '@nestjs/common';
import { Roles } from 'src/shared/roles.decorator';
import { AuthenticatedRequest } from 'src/shared/types';
import { AuditService } from '../audit/audit.service';
import { FindAuditParams } from '../audit/dto/find-audit.params';
import { FindPeopleParams, UpdateProfileDto, UpdateTrainingDto } from './dto/coordination.dto';
import { CoordinationService } from './coordination.service';
import { PeopleService } from './people.service';

/**
 * Central de Coordenação: visão do TPE inteiro e ajustes gerais.
 * Só COORDINATOR — conferido no banco pelo RolesGuard (não pelo perfil do token).
 */
@Controller('coordination')
@Roles('COORDINATOR')
export class CoordinationController {
  constructor(
    private readonly coordinationService: CoordinationService,
    private readonly peopleService: PeopleService,
    private readonly auditService: AuditService,
  ) {}

  @Get('overview')
  overview() {
    return this.coordinationService.getOverview();
  }

  @Get('people')
  people(@Query() query: FindPeopleParams) {
    return this.peopleService.findAll(query);
  }

  @Patch('people/:id/profile')
  updateProfile(@Request() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: UpdateProfileDto) {
    return this.peopleService.updateProfile(id, body, req.user);
  }

  @Patch('people/:id/training')
  updateTraining(@Request() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: UpdateTrainingDto) {
    return this.peopleService.updateTraining(id, body, req.user);
  }

  @Get('audit')
  audit(@Query() query: FindAuditParams) {
    return this.auditService.findAll(query);
  }
}
