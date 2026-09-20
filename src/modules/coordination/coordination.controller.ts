import { Controller, Get } from '@nestjs/common';
import { Roles } from 'src/shared/roles.decorator';
import { CoordinationService } from './coordination.service';

/**
 * Central de Coordenação: visão do TPE inteiro e ajustes gerais.
 * Só COORDINATOR — conferido no banco pelo RolesGuard (não pelo perfil do token).
 */
@Controller('coordination')
@Roles('COORDINATOR')
export class CoordinationController {
  constructor(private readonly coordinationService: CoordinationService) {}

  @Get('overview')
  overview() {
    return this.coordinationService.getOverview();
  }
}
