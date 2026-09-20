import { Body, Controller, Delete, Get, Param, Patch, Put, Query, Request } from '@nestjs/common';
import { Roles } from 'src/shared/roles.decorator';
import { AuthenticatedRequest } from 'src/shared/types';
import { AuditAction, AuditService } from '../audit/audit.service';
import { FindAuditParams } from '../audit/dto/find-audit.params';
import { SETTING_KEYS, SettingsService } from '../settings/settings.service';
import { FindPeopleParams, UpdateAnnouncementDto, UpdateProfileDto, UpdateTrainingDto, UpdateWhatsappTemplateDto } from './dto/coordination.dto';
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
    private readonly settingsService: SettingsService,
  ) {}

  private auditSetting(req: AuthenticatedRequest, key: string, name: string, label: string) {
    return this.auditService.log({
      actor: req.user,
      action: AuditAction.SETTING_CHANGE,
      entity: 'setting',
      entityId: key,
      entityName: name,
      metadata: { key, label },
    });
  }

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

  @Put('settings/announcement')
  async updateAnnouncement(@Request() req: AuthenticatedRequest, @Body() body: UpdateAnnouncementDto) {
    const result = await this.settingsService.setAnnouncement(body);
    await this.auditSetting(req, SETTING_KEYS.ANNOUNCEMENT, 'Aviso aos capitães', body.enabled ? 'Aviso ativado/atualizado' : 'Aviso desativado');
    return result;
  }

  @Put('settings/waitlist-whatsapp')
  async updateWaitlistWhatsapp(@Request() req: AuthenticatedRequest, @Body() body: UpdateWhatsappTemplateDto) {
    const result = await this.settingsService.setWaitlistWhatsapp(body.message);
    await this.auditSetting(req, SETTING_KEYS.WAITLIST_WHATSAPP, 'Mensagem de WhatsApp da Lista de Espera', 'Mensagem alterada');
    return result;
  }

  @Delete('settings/waitlist-whatsapp')
  async resetWaitlistWhatsapp(@Request() req: AuthenticatedRequest) {
    const result = await this.settingsService.resetWaitlistWhatsapp();
    await this.auditSetting(req, SETTING_KEYS.WAITLIST_WHATSAPP, 'Mensagem de WhatsApp da Lista de Espera', 'Voltou ao modelo padrão');
    return result;
  }

  @Get('audit')
  audit(@Query() query: FindAuditParams) {
    return this.auditService.findAll(query);
  }
}
