import * as jwt from 'jsonwebtoken';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TransactionLogger } from 'src/infra/transaction.logger';
import { JwtPayload } from 'src/shared/types/jwt.types';

@Injectable()
export class AuthGuard implements CanActivate {
  logger = new TransactionLogger(AuthGuard.name);
  constructor(private reflector: Reflector) { }
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException('Não autorizado');
    }
    const payload = this.validateToken(token);
    request['user'] = payload;
    this.logger.log(`Rota privada - ${request.url} - ${request.method} - ${JSON.stringify(payload)}`);
    return true;
  }

  private extractTokenFromHeader(request: any): string | undefined {
    let token = '';
    if (request?.headers?.authorization) {
      token = request?.headers?.authorization;
    } else if (request?.handshake?.auth.token) {
      token = request?.handshake?.auth.token;
    }
    if (!token) throw new UnauthorizedException('Token não encontrado');
    return token.replace('Bearer ', '');
  }

  validateToken(token: string): JwtPayload {
    try {
      const payload = jwt.verify(token, 'tpe-sorocaba') as JwtPayload;
      return payload;
    } catch (error) {
      this.logger.error(`Token inválido: ${error.message} - Token: ${token}`);
      throw new UnauthorizedException(`Token inválido: ${error.message}`);
    }
  }
}
