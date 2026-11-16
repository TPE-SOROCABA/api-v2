import { Injectable, Logger } from '@nestjs/common';

/**
 * Consulta da instância do WhatsApp (Z-API) para a Central de Coordenação.
 *
 * Só leitura: o BFF não envia mensagem por aqui — quem publica na fila é o
 * `SqsDispatcherService` e quem entrega é a legacy. Aqui é diagnóstico:
 * a coordenação olha se a instância está de fato conectada e, se não estiver,
 * lê o QR Code para reconectar a MESMA instância.
 *
 * As variáveis mantêm o nome da legacy de propósito (`Z_API_URL`,
 * `INSTANCE_ID`, `INSTANCE_TOKEN`, `USER_TOKEN_ID`): o valor já cadastrado no
 * Portainer é copiado sem renomear, e `Z_API_URL` já vem com o `/instances`
 * no fim, como em `api/src/infra/adapter/Z_APIWhatsAppAdapter.ts`.
 */

const REQUEST_TIMEOUT_MS = 10_000;

export interface ZapiStatus {
  /** false quando não deu para consultar o Z-API (sem env, rede, erro do Z-API). */
  reachable: boolean;
  connected: boolean;
  /** null quando o Z-API não informou. */
  smartphoneConnected: boolean | null;
  /** texto do Z-API, útil quando desconectado ("You need to restore the session"). */
  detail: string | null;
  /** motivo da falha de comunicação, já sem credenciais. */
  message: string | null;
}

/**
 * `qrcode` traz a imagem em base64. `challenge` é o caso raro em que o
 * WhatsApp exige "Chave de Acesso" depois da leitura — não implementamos o
 * passkey, só orientamos a concluir pelo painel/extensão da Z-API.
 */
export type ZapiQrResult = { state: 'qrcode'; qrcode: string } | { state: 'challenge'; message: string } | { state: 'unavailable'; message: string };

@Injectable()
export class ZapiService {
  private readonly logger = new Logger(ZapiService.name);

  /** Base sem barra final, já com o `/instances` que vem da env. */
  private instanceUrl(suffix: string): string | null {
    const base = process.env.Z_API_URL?.replace(/\/+$/, '');
    const instanceId = process.env.INSTANCE_ID;
    const token = process.env.INSTANCE_TOKEN;
    if (!base || !instanceId || !token) return null;
    return `${base}/${instanceId}/token/${token}/${suffix}`;
  }

  private headers(): Record<string, string> {
    return { 'Content-Type': 'application/json', 'Client-Token': process.env.USER_TOKEN_ID ?? '' };
  }

  /**
   * `fetch` com timeout. O log usa só o endpoint — token e instance nunca
   * entram em log nem em mensagem de erro.
   */
  private async request(url: string): Promise<{ ok: boolean; status: number; body: Record<string, unknown> | null; error?: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { method: 'GET', headers: this.headers(), signal: controller.signal });
      const text = await response.text();
      let body: Record<string, unknown> | null = null;
      try {
        body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
      } catch {
        body = null;
      }
      return { ok: response.ok, status: response.status, body };
    } catch (error) {
      const reason = error instanceof Error && error.name === 'AbortError' ? `tempo limite de ${REQUEST_TIMEOUT_MS / 1000}s excedido` : 'não foi possível alcançar o Z-API';
      return { ok: false, status: 0, body: null, error: reason };
    } finally {
      clearTimeout(timer);
    }
  }

  async getStatus(): Promise<ZapiStatus> {
    const url = this.instanceUrl('status-check');
    if (!url) {
      return this.unreachable('Z-API não configurado neste ambiente (Z_API_URL, INSTANCE_ID e INSTANCE_TOKEN).');
    }

    const { ok, status, body, error } = await this.request(url);
    if (!ok) {
      this.logger.warn(`[ZAPI] status-check respondeu ${status || 'sem resposta'}: ${error ?? 'erro do Z-API'}`);
      return this.unreachable(error ?? `o Z-API respondeu ${status}.`);
    }

    return {
      reachable: true,
      connected: body?.connected === true,
      smartphoneConnected: typeof body?.smartphoneConnected === 'boolean' ? (body.smartphoneConnected as boolean) : null,
      detail: typeof body?.error === 'string' && body.error.trim() ? (body.error as string) : null,
      message: null,
    };
  }

  async getQrCode(): Promise<ZapiQrResult> {
    const url = this.instanceUrl('qrcode/show-image');
    if (!url) {
      return { state: 'unavailable', message: 'Z-API não configurado neste ambiente (Z_API_URL, INSTANCE_ID e INSTANCE_TOKEN).' };
    }

    const { ok, status, body, error } = await this.request(url);
    if (!ok) {
      this.logger.warn(`[ZAPI] qrcode/show-image respondeu ${status || 'sem resposta'}: ${error ?? 'erro do Z-API'}`);
      return { state: 'unavailable', message: error ?? `o Z-API respondeu ${status}.` };
    }

    if (body?.challenge) {
      // Caso raro: o aparelho exige Chave de Acesso depois de ler o QR.
      return { state: 'challenge', message: 'Este aparelho exigiu Chave de Acesso. Conclua a conexão pelo painel da Z-API ou pela extensão Z-API Conector.' };
    }

    // O campo mudou entre versões do Z-API (value/qrcode/qrcodeImage).
    const image = ['value', 'qrcode', 'qrcodeImage', 'base64', 'image'].map((key) => body?.[key]).find((v) => typeof v === 'string' && v.trim().length > 0) as string | undefined;
    if (image) return { state: 'qrcode', qrcode: image };

    // Já conectado, o Z-API não devolve imagem — a INSTANCE está online.
    return { state: 'unavailable', message: 'A instância já está conectada, ou o Z-API não devolveu o QR Code agora.' };
  }

  private unreachable(message: string): ZapiStatus {
    return { reachable: false, connected: false, smartphoneConnected: null, detail: null, message };
  }
}
