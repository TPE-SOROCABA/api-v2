import { Injectable } from '@nestjs/common';
import { GroupType } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';

/** Chave em `system_settings` (tabela chave/valor que já existia): `group_send:<groupId>` = 'on' | 'off'. */
export const groupSendKey = (groupId: string) => `group_send:${groupId}`;

/**
 * Liberação do envio de mensagens de designação por grupo (tela Coordenação > Envio de mensagens).
 *
 * Regra: se o coordenador definiu (ligado/desligado), vale o que ele definiu. Se nunca mexeu, os grupos
 * de sempre (Centro e Adicional) continuam enviando como hoje, e o grupo Especial (ex.: Zoológico)
 * começa DESLIGADO: ele só recebe mensagem depois que o coordenador liberar.
 */
@Injectable()
export class GroupSendService {
  constructor(private readonly prisma: PrismaService) {}

  static defaultFor(type: GroupType): boolean {
    return type !== GroupType.SPECIAL;
  }

  async isEnabled(group: { id: string; type: GroupType }): Promise<boolean> {
    const row = await this.prisma.systemSettings.findUnique({ where: { key: groupSendKey(group.id) } });
    if (!row) return GroupSendService.defaultFor(group.type);
    return row.value === 'on';
  }

  /** Todos os grupos com o estado atual do envio. */
  async list() {
    const [groups, rows] = await Promise.all([
      this.prisma.groups.findMany({ orderBy: [{ type: 'asc' }, { name: 'asc' }], select: { id: true, name: true, type: true, status: true, configWeekday: true, configStartHour: true, whatsappId: true } }),
      this.prisma.systemSettings.findMany({ where: { key: { startsWith: 'group_send:' } } }),
    ]);
    const explicit = new Map(rows.map((r) => [r.key.slice('group_send:'.length), r.value === 'on']));
    return groups.map((g) => ({
      groupId: g.id,
      name: g.name,
      type: g.type,
      status: g.status,
      weekday: g.configWeekday,
      startHour: g.configStartHour,
      hasWhatsapp: !!g.whatsappId,
      enabled: explicit.get(g.id) ?? GroupSendService.defaultFor(g.type),
      // true = o coordenador escolheu; false = está no padrão do tipo do grupo
      explicit: explicit.has(g.id),
    }));
  }

  async set(groupId: string, enabled: boolean) {
    const group = await this.prisma.groups.findUnique({ where: { id: groupId }, select: { id: true, name: true, type: true } });
    if (!group) return null;
    const value = enabled ? 'on' : 'off';
    await this.prisma.systemSettings.upsert({
      where: { key: groupSendKey(groupId) },
      create: { key: groupSendKey(groupId), value },
      update: { value },
    });
    return { groupId: group.id, name: group.name, type: group.type, enabled };
  }
}
