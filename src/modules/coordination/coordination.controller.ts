import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Put, Query, Request } from '@nestjs/common';
import { Roles } from 'src/shared/roles.decorator';
import { GroupSendService, groupSendKey } from 'src/shared/group-send.service';
import { SupplyRotationService, cleaningKey, supplyKey } from 'src/shared/supply-rotation.service';
import { AuthenticatedRequest } from 'src/shared/types';
import { AuditAction, AuditService } from '../audit/audit.service';
import { FindAuditParams } from '../audit/dto/find-audit.params';
import { MENU_PROFILES, MENU_SETTING_KEY, SETTING_KEYS, SettingsService } from '../settings/settings.service';
import { CleaningGenerateDto, CleaningMonthDto, FindHistoryParams, FindPeopleParams, UpdateAnnouncementDto, SupplyBulkDto, SupplyGenerateDto, SupplyMonthDto, UpdateGroupSendDto, UpdateMenuPermissionsDto, UpdateProfileDto, UpdateTrainingDto, UpdateWhatsappTemplateDto } from './dto/coordination.dto';
import { CoordinationService } from './coordination.service';
import { HistoryService } from './history.service';
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
    private readonly historyService: HistoryService,
    private readonly groupSendService: GroupSendService,
    private readonly supplyService: SupplyRotationService,
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

  // Histórico de UMA pessoa: ações registradas + por onde trabalhou (estimado pelas designações) + faltas
  @Get('people/:id/history')
  personHistory(@Param('id') id: string, @Query() query: FindHistoryParams) {
    return this.historyService.person(id, query.months ?? 12);
  }

  // Rotatividade: quem passou por mais de um grupo (saídas estimadas + trocas registradas) e como estão as faltas
  @Get('turnover')
  turnover(@Query() query: FindHistoryParams) {
    return this.historyService.turnover(query.months ?? 12, query.minGroups ?? 2);
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

  // Envio de mensagens de designação por grupo (Zoológico/grupos Especiais começam desligados)
  @Get('group-send')
  groupSendList() {
    return this.groupSendService.list();
  }

  @Put('group-send/:groupId')
  async groupSendSet(@Request() req: AuthenticatedRequest, @Param('groupId') groupId: string, @Body() body: UpdateGroupSendDto) {
    const result = await this.groupSendService.set(groupId, body.enabled);
    if (!result) throw new NotFoundException('Grupo não encontrado');
    await this.auditSetting(req, groupSendKey(groupId), `Envio de mensagens: ${result.name}`, body.enabled ? 'Envio liberado' : 'Envio desligado');
    return result;
  }

  // Rodízio de café e limpeza dos grupos do Centro (um dia da semana por mês)
  @Get('supply')
  supplyList(@Query('year') year?: string) {
    const y = Number(year) || new Date().getFullYear();
    return this.supplyService.list(y);
  }

  @Put('supply')
  async supplySet(@Request() req: AuthenticatedRequest, @Body() body: SupplyMonthDto) {
    await this.supplyService.set(body.year, body.month, body.weekday as any, body.morning);
    await this.auditSetting(req, supplyKey(body.year, body.month), `Café e limpeza ${String(body.month).padStart(2, '0')}/${body.year}`, `Dia ${body.weekday}, manhã ${body.morning}`);
    return this.supplyService.list(body.year);
  }

  @Put('supply/bulk')
  async supplyBulk(@Request() req: AuthenticatedRequest, @Body() body: SupplyBulkDto) {
    for (const m of body.months) await this.supplyService.set(m.year, m.month, m.weekday as any, m.morning);
    await this.auditSetting(req, 'supply:bulk', 'Café e limpeza', `${body.months.length} meses carregados`);
    return { saved: body.months.length };
  }

  @Put('supply/generate')
  async supplyGenerate(@Request() req: AuthenticatedRequest, @Body() body: SupplyGenerateDto) {
    const made = await this.supplyService.generate(body.year, body.month, body.count, body.weekday as any, body.morning);
    await this.auditSetting(req, 'supply:generate', 'Café e limpeza', `${made.length} meses gerados a partir de ${String(body.month).padStart(2, '0')}/${body.year}`);
    return { made };
  }

  // Limpeza da sala: um grupo do Centro por mês
  @Put('supply/cleaning')
  async cleaningSet(@Request() req: AuthenticatedRequest, @Body() body: CleaningMonthDto) {
    await this.supplyService.setCleaning(body.year, body.month, body.groupId || null);
    await this.auditSetting(req, cleaningKey(body.year, body.month), `Limpeza da sala ${String(body.month).padStart(2, '0')}/${body.year}`, body.groupId ? `Grupo ${body.groupId}` : 'Mês sem limpeza da sala');
    return this.supplyService.list(body.year);
  }

  @Put('supply/cleaning/generate')
  async cleaningGenerate(@Request() req: AuthenticatedRequest, @Body() body: CleaningGenerateDto) {
    const made = await this.supplyService.generateCleaning(body.year, body.month, body.count, body.groupId);
    await this.auditSetting(req, 'cleaning:generate', 'Limpeza da sala', `${made.length} meses gerados a partir de ${String(body.month).padStart(2, '0')}/${body.year}`);
    return { made };
  }

  @Delete('supply/:year/:month')
  async supplyClear(@Request() req: AuthenticatedRequest, @Param('year') year: string, @Param('month') month: string) {
    await this.supplyService.clear(Number(year), Number(month));
    await this.auditSetting(req, supplyKey(Number(year), Number(month)), `Café e limpeza ${month.padStart(2, '0')}/${year}`, 'Mês removido do rodízio');
    return { ok: true };
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
