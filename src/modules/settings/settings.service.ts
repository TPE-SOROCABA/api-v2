import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infra/prisma/prisma.service';

/** Chaves usadas em `system_settings` (tabela chave/valor que já existia). */
export const SETTING_KEYS = {
  ANNOUNCEMENT: 'captain_announcement',
  WAITLIST_WHATSAPP: 'waitlist_whatsapp_message',
} as const;

/** Modelo padrão da mensagem de WhatsApp da Lista de Espera. {nome}, {dia} e {periodo} são trocados no envio. */
export const DEFAULT_WAITLIST_WHATSAPP = 'Olá {nome}, tudo bem? Sou do TPE. Abriu uma vaga no grupo de {dia} {periodo} e vi que você está disponível. Podemos conversar?';

export interface Announcement {
  enabled: boolean;
  message: string;
  /** muda a cada edição; o front usa pra lembrar "já vi" por aviso */
  updatedAt: string | null;
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAnnouncement(): Promise<Announcement> {
    const row = await this.prisma.systemSettings.findUnique({ where: { key: SETTING_KEYS.ANNOUNCEMENT } });
    if (!row) return { enabled: false, message: '', updatedAt: null };
    try {
      const parsed = JSON.parse(row.value) as { enabled?: boolean; message?: string };
      return { enabled: !!parsed.enabled, message: parsed.message ?? '', updatedAt: row.updatedAt.toISOString() };
    } catch {
      return { enabled: false, message: '', updatedAt: null };
    }
  }

  async setAnnouncement(data: { enabled: boolean; message: string }): Promise<Announcement> {
    const value = JSON.stringify({ enabled: data.enabled, message: data.message.trim() });
    await this.prisma.systemSettings.upsert({
      where: { key: SETTING_KEYS.ANNOUNCEMENT },
      create: { key: SETTING_KEYS.ANNOUNCEMENT, value },
      update: { value },
    });
    return this.getAnnouncement();
  }

  async getWaitlistWhatsapp(): Promise<{ message: string; isDefault: boolean }> {
    const row = await this.prisma.systemSettings.findUnique({ where: { key: SETTING_KEYS.WAITLIST_WHATSAPP } });
    return row?.value ? { message: row.value, isDefault: false } : { message: DEFAULT_WAITLIST_WHATSAPP, isDefault: true };
  }

  async setWaitlistWhatsapp(message: string) {
    const value = message.trim();
    await this.prisma.systemSettings.upsert({
      where: { key: SETTING_KEYS.WAITLIST_WHATSAPP },
      create: { key: SETTING_KEYS.WAITLIST_WHATSAPP, value },
      update: { value },
    });
    return this.getWaitlistWhatsapp();
  }

  /** Volta ao modelo padrão (apaga a customização). */
  async resetWaitlistWhatsapp() {
    await this.prisma.systemSettings.deleteMany({ where: { key: SETTING_KEYS.WAITLIST_WHATSAPP } });
    return this.getWaitlistWhatsapp();
  }
}
