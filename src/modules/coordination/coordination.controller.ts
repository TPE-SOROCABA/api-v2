import { Body, Controller, Delete, Get, Param, Patch, Put, Query, Request } from '@nestjs/common';
import { Roles } from 'src/shared/roles.decorator';
import { AuthenticatedRequest } from 'src/shared/types';
import { AuditAction, AuditService } from '../audit/audit.service';
import { FindAuditParams } from '../audit/dto/find-audit.params';
import { MENU_PROFILES, MENU_SETTING_KEY, SETTING_KEYS, SettingsService } from '../settings/settings.service';
import { FindPeopleParams, UpdateAnnouncementDto, UpdateMenuPermissionsDto, UpdateProfileDto, UpdateTrainingDto, UpdateWhatsappTemplateDto } from './dto/coordination.dto';
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

  @Put('settings/menu-permissions')
  async updateMenuPermissions(@Request() req: AuthenticatedRequest, @Body() body: UpdateMenuPermissionsDto) {
    const before = (await this.settingsService.getMenuPermissions()).permissions;
    const result = await this.settingsService.setMenuPermissions(body.permissions);
    // o que mudou por perfil (telas liberadas / escondidas), pra aparecer no histórico
    const changes: Record<string, { added: string[]; removed: string[] }> = {};
    for (const profile of MENU_PROFILES) {
      const added = result.permissions[profile].filter((p) => !before[profile].includes(p));
      const removed = before[profile].filter((p) => !result.permissions[profile].includes(p));
      if (added.length || removed.length) changes[profile] = { added, removed };
    }
    await this.auditService.log({
      actor: req.user,
      action: AuditAction.PERMISSIONS_CHANGE,
      entity: 'setting',
      entityId: MENU_SETTING_KEY,
      entityName: 'Menu por perfil',
      metadata: { key: MENU_SETTING_KEY, changes },
    });
    return result;
  }

  @Delete('settings/menu-permissions')
  async resetMenuPermissions(@Request() req: AuthenticatedRequest) {
    const result = await this.settingsService.resetMenuPermissions();
    await this.auditSetting(req, MENU_SETTING_KEY, 'Menu por perfil', 'Voltou ao padrão');
    return result;
  }

  @Get('audit')
  audit(@Query() query: FindAuditParams) {
    return this.auditService.findAll(query);
  }
}
