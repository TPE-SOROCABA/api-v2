import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { JwtPayload } from './types';

/**
 * Autorização por grupo. A API v2 não valida perfil/grupo em lugar nenhum
 * (o guard só confere a assinatura do JWT), então este serviço centraliza
 * a regra de "quem enxerga o quê":
 *
 * - COORDINATOR / ADMIN_ANALYST / ASSISTANT_COORDINATOR -> vê todos os grupos.
 * - CAPTAIN / ASSISTANT_CAPTAIN (perfil de grupo) -> só os grupos onde ele
 *   tem esse perfil em `participants_groups`.
 * - qualquer outro -> 403.
 *
 * NÃO confiar no `groupId` do token: a legacy o preenche com o primeiro
 * `participants_groups` do participante (sem ordenação), que pode não ser o
 * grupo onde ele é capitão. Por isso consultamos o banco aqui.
 */
/** `all: true` => vê todos os grupos (groupIds fica vazio e é ignorado). */
export interface GroupScope {
  all: boolean;
  groupIds: string[];
}

const ALL_GROUPS_PROFILES = ['COORDINATOR', 'ADMIN_ANALYST', 'ASSISTANT_COORDINATOR'];

@Injectable()
export class GroupScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(user: JwtPayload): Promise<GroupScope> {
    if (user?.profile && ALL_GROUPS_PROFILES.includes(user.profile)) {
      return { all: true, groupIds: [] };
    }

    const rows = await this.prisma.participantsGroups.findMany({
      where: {
        participantId: user?.id,
        profile: { in: ['CAPTAIN', 'ASSISTANT_CAPTAIN'] },
      },
      select: { groupId: true },
    });

    if (rows.length === 0) {
      throw new ForbiddenException('Usuário não tem acesso a nenhum grupo');
    }

    return { all: false, groupIds: [...new Set(rows.map((r) => r.groupId))] };
  }

  /**
   * Resolve o filtro de grupo efetivo para uma consulta, dado um `groupId`
   * opcional que veio da request.
   * - retorna `{ groupIds: undefined }` quando é pra trazer todos os grupos.
   * - lança 403 se um capitão pedir um grupo que não é dele.
   */
  async resolveGroupFilter(user: JwtPayload, requestedGroupId?: string): Promise<{ groupIds?: string[] }> {
    const scope = await this.resolve(user);

    if (scope.all) {
      return requestedGroupId ? { groupIds: [requestedGroupId] } : { groupIds: undefined };
    }

    if (requestedGroupId) {
      if (!scope.groupIds.includes(requestedGroupId)) {
        throw new ForbiddenException('Sem acesso a esse grupo');
      }
      return { groupIds: [requestedGroupId] };
    }

    return { groupIds: scope.groupIds };
  }
}
