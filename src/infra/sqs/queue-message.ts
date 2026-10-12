/**
 * Contrato da fila de WhatsApp.
 *
 * ATENÇÃO: este formato é compartilhado com a legacy, que continua sendo a
 * consumidora (`api/src/functions/whatsapp/handler.ts` faz
 * `JSON.parse(record.body)` e tipa como `QueueMessagePayload`). Qualquer campo
 * aqui precisa existir com o mesmo nome e tipo lá, senão a mensagem chega
 * quebrada no consumidor. Se mudar, mudar junto nos dois lados.
 */
export type QueueMessagePayload = {
  phone: string;
  message: string;
  title?: string;
  footer?: string;
  linkUrl?: string;
  linkDescription?: string;
  type: 'text' | 'button' | 'otp';
  buttonActions?: unknown[];
  code?: string;
  /** Unix timestamp em segundos. O consumidor espera até esse momento antes de enviar. */
  scheduledAt?: number;
};
