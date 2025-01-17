import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TransactionContext } from 'src/infra/transaction.context';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class TransactionMiddleware implements NestMiddleware {
    constructor() { }

    use(req: Request, res: Response, next: NextFunction) {
        const transactionId = uuidv4();
        req.headers['x-transaction-id'] = transactionId;
        res.setHeader('x-transaction-id', transactionId);

        TransactionContext.run(transactionId, () => {
            next();
        });
    }
}
