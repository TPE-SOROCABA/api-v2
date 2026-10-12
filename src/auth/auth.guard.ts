import * as jwt from 'jsonwebtoken';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TransactionLogger } from 'src/infra/transaction.logger';
import { JwtPayload } from 'src/shared/types/jwt.types';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  logger = new TransactionLogger(AuthGuard.name);
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    // rota marcada com @Public() (login, recuperação de senha) não exige token
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) {
      // ...mas se o token vier, ele é aproveitado. É o que permite ao capitão logado ser
      // reconhecido como reporter em rotas abertas ao voluntário (faltas na designação).
      const publicToken = this.tryExtractToken(request);
      if (publicToken) {
        try {
          request['user'] = this.verify(publicToken, false);
        } catch {
          // rota pública: token inválido não bloqueia (ex.: voluntário com token expirado)
        }
      }
      return true;
    }

    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException('Não autorizado');
    }
    const payload = this.validateToken(token);
    request['user'] = payload;
    // id e perfil só: o payload também carrega cpf e foto, que não precisam ficar em log
    this.logger.log(`Rota privada - ${request.url} - ${request.method} - user=${payload.id} profile=${payload.profile}`);
    return true;
  }

  /** Só lê o header — não lança. Para rotas públicas, onde o token é opcional. */
  private tryExtractToken(request: any): string | undefined {
    const raw = request?.headers?.authorization || request?.handshake?.auth?.token;
    if (!raw || typeof raw !== 'string') return undefined;
    return raw.replace('Bearer ', '');
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const token = this.tryExtractToken(request);
    if (!token) throw new UnauthorizedException('Token não encontrado');
    return token;
  }

  validateToken(token: string): JwtPayload {
    return this.verify(token, true);
  }

  /** `report=false` para rota pública: token inválido ali é esperado (sessão expirada), não é erro. */
  private verify(token: string, report: boolean): JwtPayload {
    try {
      const secret = process.env.JWT_SECRET || 'tpe-sorocaba';
      return jwt.verify(token, secret) as JwtPayload;
    } catch (error) {
      if (report) {
        // não loga o token: é credencial
        this.logger.error(`Token inválido: ${error.message}`);
      }
      throw new UnauthorizedException(`Token inválido: ${error.message}`);
    }
  }
}
