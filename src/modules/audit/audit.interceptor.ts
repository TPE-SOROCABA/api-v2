import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { AuditAction, AuditActionType, AuditService } from './audit.service';

/**
 * Histórico de ações "de cadastro": registra petições, cadastro de voluntários, grupos, pontos e exclusão
 * de designação, sem precisar mexer em cada serviço. Só aparecem aqui as rotas do api-v2: designações,
 * envio e faltas são gravados pela legacy e não passam por aqui.
 *
 * O que vai pro histórico: quem fez, o quê, em quem e QUAIS CAMPOS foram enviados. Os VALORES não são
 * gravados (evita guardar telefone, CPF, endereço etc. no histórico). Nunca derruba a operação: se a
 * gravação (ou a consulta do nome) falhar, a requisição segue normal.
 *
 * Ações que já têm registro próprio e mais detalhado (entrar/sair de grupo, perfil, treinamento, pedidos
 * de troca, configurações) NÃO estão nesta tabela, para não duplicar.
 */
interface Rule {
  action: AuditActionType;
  entity: string;
  /** modelo do Prisma pra buscar o nome do alvo ANTES da operação (útil pra exclusões) */
  model?: 'participants' | 'petitions' | 'groups' | 'points' | 'designations';
  /** nome do parâmetro de rota com o id do alvo; sem ele, o id vem da resposta (criações) */
  idParam?: string;
  /** guarda também os nomes dos campos enviados no corpo */
  fields?: boolean;
  /** parâmetros de rota extras pra metadata */
  extraParams?: string[];
}

const RULES: Record<string, Rule> = {
  'PATCH /petitions/waiting-information/:id': { action: AuditAction.PETITION_WAITING_INFO, entity: 'petition', model: 'petitions', idParam: 'id' },
  'PATCH /petitions/exclude/:id': { action: AuditAction.PETITION_EXCLUDE, entity: 'petition', model: 'petitions', idParam: 'id' },
  'PATCH /petitions/activate/:id': { action: AuditAction.PETITION_ACTIVATE, entity: 'petition', model: 'petitions', idParam: 'id' },
  'POST /petitions/upload': { action: AuditAction.PETITION_UPLOAD, entity: 'petition' },
  'PUT /petitions/upload/:id': { action: AuditAction.PETITION_UPDATE, entity: 'petition', model: 'petitions', idParam: 'id' },
  'DELETE /petitions/:id': { action: AuditAction.PETITION_DELETE, entity: 'petition', model: 'petitions', idParam: 'id' },
  'POST /participants': { action: AuditAction.PARTICIPANT_CREATE, entity: 'participant' },
  'PUT /participants/:id': { action: AuditAction.PARTICIPANT_UPDATE, entity: 'participant', model: 'participants', idParam: 'id', fields: true },
  'POST /groups': { action: AuditAction.GROUP_CREATE, entity: 'group' },
  'PUT /groups/:id': { action: AuditAction.GROUP_UPDATE, entity: 'group', model: 'groups', idParam: 'id', fields: true },
  'DELETE /groups/:id': { action: AuditAction.GROUP_DELETE, entity: 'group', model: 'groups', idParam: 'id' },
  'POST /groups/:groupId/points': { action: AuditAction.POINT_CREATE, entity: 'point', extraParams: ['groupId'] },
  'PUT /points/:pointId': { action: AuditAction.POINT_UPDATE, entity: 'point', model: 'points', idParam: 'pointId', fields: true },
  'DELETE /designations/:id': { action: AuditAction.DESIGNATION_DELETE, entity: 'designation', model: 'designations', idParam: 'id' },
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest();
    const rule = RULES[`${req.method} ${req.route?.path}`];
    if (!rule) return next.handle();

    const id: string | undefined = rule.idParam ? req.params?.[rule.idParam] : undefined;
    const nameBefore = id && rule.model ? await this.lookupName(rule.model, id) : null;

    return next.handle().pipe(
      tap({
        // só quando a operação deu certo
        next: (body: any) => {
          void this.record(rule, req, id, nameBefore, body);
        },
      }),
    );
  }

  private async lookupName(model: NonNullable<Rule['model']>, id: string): Promise<string | null> {
    try {
      const row = await (this.prisma as any)[model].findUnique({ where: { id }, select: { name: true } });
      return row?.name ?? null;
    } catch {
      return null;
    }
  }

  private async record(rule: Rule, req: any, id: string | undefined, nameBefore: string | null, body: any) {
    try {
      const metadata: Record<string, unknown> = {};
      if (rule.fields && req.body && typeof req.body === 'object') metadata.fields = Object.keys(req.body);
      for (const p of rule.extraParams ?? []) metadata[p] = req.params?.[p];

      await this.audit.log({
        actor: req.user,
        action: rule.action,
        entity: rule.entity,
        entityId: id ?? (typeof body?.id === 'string' ? body.id : null),
        entityName: nameBefore ?? (typeof body?.name === 'string' ? body.name : null),
        metadata: Object.keys(metadata).length ? (metadata as never) : undefined,
      });
    } catch (error) {
      this.logger.error(`Falha ao registrar ${rule.action}: ${(error as Error).message}`);
    }
  }
}
