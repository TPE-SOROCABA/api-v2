import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { ROLES_KEY } from './roles.decorator';
import { UserProfile } from './types';

/**
 * Autorização por perfil global (`participants.profile`).
 *
 * O `AuthGuard` só valida a assinatura do JWT, e o perfil gravado no token só muda no
 * próximo login. Por isso este guard consulta o banco: se alguém é rebaixado de
 * coordenador, perde o acesso na hora, mesmo com o token antigo ainda válido.
 *
 * Roda depois do `AuthGuard` (ordem de registro em `AppModule`), que popula `request.user`.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<UserProfile[] | undefined>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.id;
    if (!userId) throw new UnauthorizedException('Não autorizado');

    const participant = await this.prisma.participants.findUnique({ where: { id: userId }, select: { profile: true } });
    if (!participant?.profile || !required.includes(participant.profile as UserProfile)) {
      throw new ForbiddenException('Você não tem permissão para esta ação');
    }
    return true;
  }
}
