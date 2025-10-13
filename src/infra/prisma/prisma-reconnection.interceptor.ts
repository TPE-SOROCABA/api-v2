import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, retry, delay } from 'rxjs/operators';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaReconnectionInterceptor implements NestInterceptor {
  private logger = new Logger(PrismaReconnectionInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((error) => {
        // Verifica se é um erro de conexão do Neon
        if (this.isConnectionError(error)) {
          this.logger.log('🔌 Operação falhou: Neon hibernou durante execução - tentando despertar...');
          
          // Tenta reconectar e reexecutar a operação uma vez
          return this.handleReconnection().pipe(
            catchError((retryError) => {
              this.logger.error('❌ Falha crítica: Não conseguiu despertar Neon após hibernação:', retryError.message);
              return throwError(() => error); // Retorna o erro original
            })
          );
        }
        
        // Para outros erros, apenas repassa
        return throwError(() => error);
      })
    );
  }

  private isConnectionError(error: any): boolean {
    const connectionErrors = [
      'Connection terminated',
      'Connection closed',
      'Connection lost',
      'Server has closed the connection',
      'Connection reset by peer',
      'ECONNRESET',
      'ENOTFOUND',
      'ETIMEDOUT',
    ];

    const errorMessage = error?.message || '';
    return connectionErrors.some(msg => 
      errorMessage.includes(msg) || 
      (error?.kind === 'Closed') ||
      (error?.code && ['P1001', 'P1008', 'P1017'].includes(error.code))
    );
  }

  private handleReconnection(): Observable<any> {
    return new Observable(subscriber => {
      this.logger.log('⏳ Despertando Neon após hibernação inesperada...');
      this.prisma.connectToDatabase()
        .then(() => {
          this.logger.log('🌅 Neon despertou com sucesso - Reexecutando operação...');
          subscriber.next(true);
          subscriber.complete();
        })
        .catch(error => {
          this.logger.error('💥 Falha crítica ao despertar Neon:', error.message);
          subscriber.error(error);
        });
    }).pipe(
      delay(1000), // Pequeno delay antes de retentar
    );
  }
}