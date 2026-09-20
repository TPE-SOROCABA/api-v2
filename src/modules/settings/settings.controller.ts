import { Controller, Get } from '@nestjs/common';
import { SettingsService } from './settings.service';

/**
 * Leitura das configurações que as telas precisam (qualquer usuário logado).
 * A escrita fica em /coordination/settings/* (só coordenador, com auditoria).
 */
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('announcement')
  announcement() {
    return this.settingsService.getAnnouncement();
  }

  @Get('waitlist-whatsapp')
  waitlistWhatsapp() {
    return this.settingsService.getWaitlistWhatsapp();
  }
}
