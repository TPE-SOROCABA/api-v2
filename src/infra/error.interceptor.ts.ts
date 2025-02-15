import { Injectable, NestInterceptor, ExecutionContext, CallHandler, HttpException } from '@nestjs/common';
import { Observable, catchError } from 'rxjs';
import { Response } from 'express';
import { TransactionContext } from './transaction.context';
import { TransactionLogger } from './transaction.logger';

@Injectable()
export class ErrorInterceptor implements NestInterceptor {
  logger = new TransactionLogger(ErrorInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    this.logger.log('Interceptando requisição...');
    return next.handle().pipe(
      catchError((error) => {
        const transactionId = TransactionContext.getTransactionId();
        this.logger.error(`Erro interceptado: ${error.message}`, error.stack);

        if (transactionId) {
          this.logger.log(`ID da transação: ${transactionId}`);
          if (error instanceof HttpException) {
            const response = context.switchToHttp().getResponse<Response>();
            const responseBody = error.getResponse();
            this.logger.error(`HttpException ocorreu: ${JSON.stringify(responseBody)}`);
            responseBody['transactionId'] = transactionId;
            response.status(error.getStatus()).json(responseBody);
          } else {
            const response = context.switchToHttp().getResponse<Response>();
            this.logger.error('Erro não HttpException ocorreu. Enviando resposta de erro genérica.');
            response.status(500).json({
              statusCode: 500,
              message: `Erro interno do servidor. ${transactionId}`,
            });
          }
        } else {
          this.logger.warn('Nenhum ID de transação encontrado.');
        }
        
        this.logger.error('Registrando erro e relançando...');
        throw error;
      }),
    );
  }
}
