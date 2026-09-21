import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { FindAuditParams } from './dto/find-audit.params';

/** Ações registradas. Texto livre no banco, mas centralizado aqui pra não divergir. */
export const AuditAction = {
  PROFILE_CHANGE: 'PROFILE_CHANGE',
  GROUP_JOIN: 'GROUP_JOIN',
  GROUP_LEAVE: 'GROUP_LEAVE',
  GROUP_ROLE_CHANGE: 'GROUP_ROLE_CHANGE',
  SETTING_CHANGE: 'SETTING_CHANGE',
  PERMISSIONS_CHANGE: 'PERMISSIONS_CHANGE',
  TRAINING_CHANGE: 'TRAINING_CHANGE',
  GROUP_TRANSFER: 'GROUP_TRANSFER',
  GROUP_CHANGE_REQUESTED: 'GROUP_CHANGE_REQUESTED',
  GROUP_CHANGE_CANCELLED: 'GROUP_CHANGE_CANCELLED',
  GROUP_CHANGE_RESOLVED: 'GROUP_CHANGE_RESOLVED',
  // cadastro (registradas pelo AuditInterceptor)
  PETITION_WAITING_INFO: 'PETITION_WAITING_INFO',
  PETITION_EXCLUDE: 'PETITION_EXCLUDE',
  PETITION_ACTIVATE: 'PETITION_ACTIVATE',
  PETITION_UPLOAD: 'PETITION_UPLOAD',
  PETITION_UPDATE: 'PETITION_UPDATE',
  PETITION_DELETE: 'PETITION_DELETE',
  PARTICIPANT_CREATE: 'PARTICIPANT_CREATE',
  PARTICIPANT_UPDATE: 'PARTICIPANT_UPDATE',
  GROUP_CREATE: 'GROUP_CREATE',
  GROUP_UPDATE: 'GROUP_UPDATE',
  GROUP_DELETE: 'GROUP_DELETE',
  POINT_CREATE: 'POINT_CREATE',
  POINT_UPDATE: 'POINT_UPDATE',
  DESIGNATION_DELETE: 'DESIGNATION_DELETE',
} as const;
export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditEntry {
  /** quem fez (payload do JWT: id + name) */
  actor?: { id?: string; name?: string } | null;
  action: AuditActionType;
  /** tipo do alvo: 'participant' | 'group' | 'setting' ... */
  entity: string;
  entityId?: string | null;
  /** nome do alvo NO MOMENTO da ação (o histórico não muda se o nome mudar depois) */
  entityName?: string | null;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Grava uma linha de auditoria. NUNCA lança: se a tabela não existir (migration ainda
   * não aplicada no ambiente) ou o banco falhar, a ação de negócio que já aconteceu
   * segue valendo — só perdemos o registro, e isso fica no log.
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLogs.create({
        data: {
          actorId: entry.actor?.id ?? null,
          actorName: entry.actor?.name ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          entityName: entry.entityName ?? null,
          metadata: entry.metadata ?? Prisma.JsonNull,
        },
      });
    } catch (error) {
      this.logger.error(`Falha ao gravar auditoria (${entry.action} ${entry.entity} ${entry.entityId ?? ''}): ${(error as Error).message}`);
    }
  }

  async findAll(params: FindAuditParams) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 30;

    const where: Prisma.AuditLogsWhereInput = {
      ...(params.action && { action: params.action }),
      ...(params.entity && { entity: params.entity }),
      ...(params.entityId && { entityId: params.entityId }),
      ...(params.actorId && { actorId: params.actorId }),
      ...((params.dateFrom || params.dateTo) && {
        createdAt: {
          ...(params.dateFrom && { gte: new Date(`${params.dateFrom}T00:00:00`) }),
          ...(params.dateTo && { lte: new Date(`${params.dateTo}T23:59:59.999`) }),
        },
      }),
      ...(params.q && {
        OR: [
          { entityName: { contains: params.q, mode: 'insensitive' } },
          { actorName: { contains: params.q, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, items] = await Promise.all([
      this.prisma.auditLogs.count({ where }),
      this.prisma.auditLogs.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { total, page, pageSize, items };
  }
}
