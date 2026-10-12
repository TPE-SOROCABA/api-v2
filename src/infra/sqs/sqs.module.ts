import { Global, Module } from '@nestjs/common';
import { SqsDispatcherService } from './sqs-dispatcher.service';

/**
 * Publicação na fila de WhatsApp. Global porque é usado por módulos com regras
 * de negócio diferentes (auth manda OTP, designação manda convite) e não faz
 * sentido expor a dependência em cada um deles.
 */
@Global()
@Module({
  providers: [SqsDispatcherService],
  exports: [SqsDispatcherService],
})
export class SqsModule {}
