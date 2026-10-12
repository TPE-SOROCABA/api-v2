import { Injectable, Logger } from '@nestjs/common';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { QueueMessagePayload } from './queue-message';

/** Velocidade humana rápida (aprox. 100 WPM) para calcular a cadência de envio. */
const CHARS_PER_SECOND = 8.0;
/** Teto do DelaySeconds do SQS. Acima disso o consumidor re-enfileira. */
const MAX_DELAY_SECONDS = 900;

/**
 * Publica mensagens na fila de WhatsApp.
 *
 * O consumidor continua sendo a legacy — aqui a gente só publica. O payload é
 *Montado com a mesma "cadência humana" de lá (ver `calculateTypingDuration`),
 * porque o `scheduledAt` é respeitado pelo consumidor antes do envio.
 *
 * É singleton de propósito: `lastScheduledAt` é estado acumulado e precisa
 * ser compartilhado entre as chamadas para espaçar as mensagens na ordem.
 */
@Injectable()
export class SqsDispatcherService {
  private readonly logger = new Logger(SqsDispatcherService.name);
  private readonly client: SQSClient;
  private lastScheduledAt: number;

  constructor() {
    // Em desenvolvimento local o ElasticMQ sobe no 9324 (ver docker-compose.dev.yml)
    const endpoint = process.env.SQS_ENDPOINT || (process.env.NODE_ENV === 'local' ? 'http://localhost:9324' : undefined);
    const localEndpoint = endpoint ? { endpoint } : {};
    this.client = new SQSClient(localEndpoint);
    this.lastScheduledAt = Math.floor(Date.now() / 1000);
  }

  async dispatch(payload: QueueMessagePayload): Promise<void> {
    const queueUrl = process.env.WHATSAPP_MESSAGE_QUEUE;
    if (!queueUrl) throw new Error('WHATSAPP_MESSAGE_QUEUE não configurada no BFF');
    const now = Math.floor(Date.now() / 1000);

    if (!payload.scheduledAt) {
      const typingDuration = this.calculateTypingDuration(payload.message);
      // Garante que o agendamento seja incremental baseado no último agendado ou no agora
      this.lastScheduledAt = Math.max(this.lastScheduledAt, now) + typingDuration;
      payload.scheduledAt = this.lastScheduledAt;
    }

    const delaySeconds = Math.max(0, Math.min(MAX_DELAY_SECONDS, payload.scheduledAt - now));

    this.logger.log(`[SQS-DISPATCHER] Enfileirando mensagem para ${payload.phone}. Alvo: ${new Date(payload.scheduledAt * 1000).toISOString()}, Delay SQS: ${delaySeconds}s.`);

    await this.client.send(
      new SendMessageCommand({
        MessageBody: JSON.stringify(payload),
        QueueUrl: queueUrl!,
        DelaySeconds: delaySeconds,
      }),
    );
  }

  /** Move a mensagem para a DLQ, de onde o cron de redrive tira depois. */
  async dispatchToDLQ(payload: QueueMessagePayload): Promise<void> {
    this.logger.log(`[SQS-DISPATCHER] [DLQ] Movendo mensagem para ${payload.phone} para a fila de erros.`);
    await this.client.send(
      new SendMessageCommand({
        MessageBody: JSON.stringify(payload),
        QueueUrl: process.env.WHATSAPP_MESSAGE_DLQ!,
        // Sem delay para mensagens com erro
      }),
    );
  }

  /** Tempo que um humano levaria para digitar a mensagem, em segundos. */
  calculateTypingDuration(text: string): number {
    const baseDelay = text.length / CHARS_PER_SECOND;
    const variation = baseDelay * 0.5; // 50% de variação para mais ou para menos
    const randomFactor = Math.random() * variation * 2 - variation;

    return Math.max(15, Math.round(baseDelay + randomFactor));
  }
}
