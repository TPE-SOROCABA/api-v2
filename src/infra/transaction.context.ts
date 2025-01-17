import { AsyncLocalStorage } from 'node:async_hooks';

export class TransactionContext {
    private static asyncLocalStorage = new AsyncLocalStorage<Map<string, string>>();

    static run(transactionId: string, callback: () => void) {
        const store = new Map<string, string>();
        store.set('transactionId', transactionId);
        this.asyncLocalStorage.run(store, callback);
    }

    static getTransactionId(): string | undefined {
        const store = this.asyncLocalStorage.getStore();
        return store?.get('transactionId');
    }
}
