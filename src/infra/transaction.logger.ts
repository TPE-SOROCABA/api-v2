import { Logger } from '@nestjs/common';
import { TransactionContext } from './transaction.context';

export class TransactionLogger extends Logger {
    log(message: unknown, context?: unknown): void {
        super.log(`[TRANSACTION] ID: ${TransactionContext.getTransactionId()} - ${message}`);
        if (context) {
            super.log(`[TRANSACTION] ID: ${TransactionContext.getTransactionId()} - ${JSON.stringify(context)}`);
        }
    }

    debug(message: unknown, context?: unknown): void {
        super.debug(`[TRANSACTION] ID: ${TransactionContext.getTransactionId()} - ${message}`)
        if (context) {
            super.debug(`[TRANSACTION] ID: ${TransactionContext.getTransactionId()} - ${JSON.stringify(context)}`);
        }
    }

    error(message: unknown, stack?: unknown, context?: unknown): void {
        super.error(`[TRANSACTION] ID: ${TransactionContext.getTransactionId()} - ${message}`);
        if (stack) {
            super.error(`[TRANSACTION] ID: ${TransactionContext.getTransactionId()} - ${stack}`);
        }
        if (context) {
            super.error(`[TRANSACTION] ID: ${TransactionContext.getTransactionId()} - ${JSON.stringify(context)}`);
        }
    }

    verbose(message: unknown, context?: unknown): void {
        super.verbose(`[TRANSACTION] ID: ${TransactionContext.getTransactionId()} - ${message}`);
        if (context) {
            super.verbose(`[TRANSACTION] ID: ${TransactionContext.getTransactionId()} - ${JSON.stringify(context)}`);
        }
    }

    warn(message: unknown, context?: unknown): void {
        super.warn(`[TRANSACTION] ID: ${TransactionContext.getTransactionId()} - ${message}`);
        if (context) {
            super.warn(`[TRANSACTION] ID: ${TransactionContext.getTransactionId()} - ${JSON.stringify(context)}`);
        }
    }

    fatal(message: unknown, context?: unknown): void {
        super.fatal(`[TRANSACTION] ID: ${TransactionContext.getTransactionId()} - ${message}`);
        if (context) {
            super.warn(`[TRANSACTION] ID: ${TransactionContext.getTransactionId()} - ${JSON.stringify(context)}`);
        }
    }
}
