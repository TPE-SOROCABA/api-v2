import { BadRequestException, Injectable } from '@nestjs/common';
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

  async getMenuPermissions(): Promise<{ permissions: MenuPermissions; isDefault: boolean }> {
    const row = await this.prisma.systemSettings.findUnique({ where: { key: MENU_SETTING_KEY } });
    if (!row) return { permissions: DEFAULT_MENU_PERMISSIONS, isDefault: true };
    try {
      const saved = JSON.parse(row.value) as Partial<MenuPermissions>;
      const permissions = {} as MenuPermissions;
      for (const profile of MENU_PROFILES) {
        const list = Array.isArray(saved[profile]) ? saved[profile]!.filter((p) => (MENU_PATHS as readonly string[]).includes(p)) : DEFAULT_MENU_PERMISSIONS[profile];
        permissions[profile] = list.includes(MENU_ALWAYS_ON) ? list : [MENU_ALWAYS_ON, ...list];
      }
      return { permissions, isDefault: false };
    } catch {
      return { permissions: DEFAULT_MENU_PERMISSIONS, isDefault: true };
    }
  }

  async setMenuPermissions(input: Record<string, unknown>) {
    const clean = {} as MenuPermissions;
    for (const profile of MENU_PROFILES) {
      const list = input?.[profile];
      if (!Array.isArray(list) || list.some((p) => typeof p !== 'string')) {
        throw new BadRequestException(`Envie a lista de telas de ${profile}`);
      }
      const unknown = (list as string[]).filter((p) => !(MENU_PATHS as readonly string[]).includes(p));
      if (unknown.length) throw new BadRequestException(`Tela não permitida para ${profile}: ${unknown.join(', ')}`);
      if (!list.includes(MENU_ALWAYS_ON)) throw new BadRequestException(`O Dashboard precisa continuar liberado para ${profile}`);
      clean[profile] = [...new Set(list as string[])];
    }
    const extra = Object.keys(input ?? {}).filter((k) => !(MENU_PROFILES as readonly string[]).includes(k));
    if (extra.length) throw new BadRequestException(`Perfil não configurável: ${extra.join(', ')}`);

    const value = JSON.stringify(clean);
    await this.prisma.systemSettings.upsert({
      where: { key: MENU_SETTING_KEY },
      create: { key: MENU_SETTING_KEY, value },
      update: { value },
    });
    return this.getMenuPermissions();
  }

  async resetMenuPermissions() {
    await this.prisma.systemSettings.deleteMany({ where: { key: MENU_SETTING_KEY } });
    return this.getMenuPermissions();
  }

  /** Volta ao modelo padrão (apaga a customização). */
  async resetWaitlistWhatsapp() {
    await this.prisma.systemSettings.deleteMany({ where: { key: SETTING_KEYS.WAITLIST_WHATSAPP } });
    return this.getWaitlistWhatsapp();
  }
}

// ---------------------------------------------------------------------------------------------
// Menu por perfil: quais telas cada perfil enxerga. É visibilidade de menu/tela no front, não uma
// trava de segurança das rotas da API.
// ---------------------------------------------------------------------------------------------

/** Perfis que chegam no token (o login da legacy só emite estes; o Coordenador sempre vê tudo). */
export const MENU_PROFILES = ['ADMIN_ANALYST', 'CAPTAIN', 'ASSISTANT_CAPTAIN'] as const;
export type MenuProfile = (typeof MENU_PROFILES)[number];
export type MenuPermissions = Record<MenuProfile, string[]>;

/**
 * Telas que o coordenador pode liberar/esconder. "Lista de Espera" e "Coordenação" ficam de fora
 * (só coordenador: as rotas delas exigem COORDINATOR no servidor).
 */
export const MENU_PATHS = ['/dashboard', '/dashboard/lista-atencao', '/consultar/historico', '/lista-designacao', '/peticoes', '/grupos', '/pontos'] as const;

/** Página inicial de todo mundo: não pode sumir, senão o redirecionamento de acesso negado não teria pra onde ir. */
export const MENU_ALWAYS_ON = '/dashboard';

// espelha o padrão de admin-tpe/lib/role-utils.ts (o que valia antes desta configuração existir)
export const DEFAULT_MENU_PERMISSIONS: MenuPermissions = {
  ADMIN_ANALYST: ['/dashboard', '/dashboard/lista-atencao', '/consultar/historico', '/peticoes', '/grupos'],
  CAPTAIN: ['/dashboard', '/dashboard/lista-atencao', '/consultar/historico', '/lista-designacao'],
  ASSISTANT_CAPTAIN: ['/dashboard', '/dashboard/lista-atencao', '/consultar/historico', '/lista-designacao'],
};

export const MENU_SETTING_KEY = 'menu_permissions';
