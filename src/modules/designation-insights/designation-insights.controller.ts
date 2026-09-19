import { Body, Controller, Get, Param, Post, UsePipes, ValidationPipe } from '@nestjs/common';
import { DesignationInsightsService } from './designation-insights.service';
import { SuggestAssignmentDto } from './dto/suggest-assignment.dto';

/**
 * Sinais de histórico pra designação — não bloqueia nada, só informa (hints na
 * tela manual) e ajuda o "Designação Automática" a evitar repetir dupla/ponto
 * recente quando dá (grupo pequeno pode repetir mesmo assim, sinalizado em
 * `warnings`).
 */
@Controller('designations/:id')
export class DesignationInsightsController {
  constructor(private readonly service: DesignationInsightsService) {}

  @Get('insights')
  getInsights(@Param('id') id: string) {
    return this.service.getInsights(id);
  }

  @Post('suggest-assignment')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  suggestAssignment(@Param('id') id: string, @Body() dto: SuggestAssignmentDto) {
    return this.service.suggestAssignment(id, dto);
  }
}
