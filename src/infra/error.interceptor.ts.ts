import { Injectable, NestInterceptor, ExecutionContext, CallHandler, HttpException } from '@nestjs/common';
import { Observable, catchError } from 'rxjs';
import { Response } from 'express';
import { TransactionContext } from './transaction.context';
import { TransactionLogger } from './transaction.logger';

@Injectable()
export class ErrorInterceptor implements NestInterceptor {
  logger = new TransactionLogger(ErrorInterceptor.name);
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((error) => {
        const transactionId = TransactionContext.getTransactionId();

        if (transactionId) {
          // Se o transactionId estiver disponível, adicione-o à mensagem do erro
          if (error instanceof HttpException) {
            const response = context.switchToHttp().getResponse<Response>();
            const responseBody = error.getResponse();
            responseBody['transactionId'] = transactionId;
            response.status(error.getStatus()).json(responseBody);
          } else {
            // Caso o erro não seja uma HttpException, usamos um erro genérico
            const response = context.switchToHttp().getResponse<Response>();
            response.status(500).json({
              statusCode: 500,
              message: `Internal server error. ${transactionId}`,
            });
          }
        } 
        this.logger.error(error);
        throw error;
      }),
    );
  }
}
