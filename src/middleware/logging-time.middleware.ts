import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TransactionLogger } from 'src/infra/transaction.logger';

@Injectable()
export class LoggingTimeMiddleware implements NestMiddleware {
  logger = new TransactionLogger(LoggingTimeMiddleware.name);
  constructor() {}
  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl } = req;
    const startTime = Date.now();

    this.logger.log(`[START] ${method} ${originalUrl}`);

    res.on('finish', () => {
      const { statusCode } = res;
      const endTime = Date.now();
      const elapsedTime = endTime - startTime;

      this.logger.log(
        `[END] ${method} ${originalUrl} - Status: ${statusCode} - Time: ${elapsedTime}ms`
      );
    });

    next();
  }
}
