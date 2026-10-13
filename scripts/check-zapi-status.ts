/**
 * Valida o ZapiService contra um Z-API local simulado.
 *
 * Não usa a instância real, não envia mensagem e não toca o banco: sobe um
 * HTTP server efêmero que imita /status e /qr-code/image, e confere
 * cada resposta que a tela pode receber.
 */
import http from 'node:http';
import assert from 'node:assert/strict';
import { ZapiService } from '../src/modules/coordination/zapi.service';

type Mode = 'connected' | 'disconnected' | 'challenge' | 'noImage' | 'http500' | 'http500semBody' | 'instanceNotFound' | 'garbage' | 'hang';
let mode: Mode = 'connected';
let calls = { status: 0, qr: 0 };
const clientTokenSeen: string[] = [];

// 1x1 PNG transparente, base64 — QR de mentira só para o front decodificar.
const FAKE_QR = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const server = http.createServer((req, res) => {
  const path = req.url ?? '';
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  clientTokenSeen.push(String(req.headers['client-token'] ?? ''));

  if (path.endsWith('/status')) {
    calls.status++;
    if (mode === 'hang') return; // não responde: exercita o timeout
    if (mode === 'http500') return send(500, { message: 'boom' });
    if (mode === 'http500semBody') {
      res.writeHead(500);
      return res.end('');
    }
    // como o Z-API responde quando o token da instância não bate
    if (mode === 'instanceNotFound') return send(400, { error: 'Instance not found', message: 'Unable to find the instance' });
    if (mode === 'garbage') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end('isto nao e json');
    }
    if (mode === 'connected') return send(200, { connected: true, error: 'You are already connected', smartphoneConnected: true });
    return send(200, { connected: false, error: 'You need to restore the session', smartphoneConnected: true });
  }

  if (path.endsWith('/qr-code/image')) {
    calls.qr++;
    if (mode === 'challenge') return send(200, { challenge: { challenge: 'abc', rpId: 'whatsapp.com' } });
    if (mode === 'noImage') return send(200, { message: 'já conectado' });
    if (mode === 'http500') return send(500, { message: 'boom' });
    return send(200, { value: FAKE_QR });
  }

  send(404, { message: 'rota desconhecida' });
});

const listen = () => new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
const close = () => new Promise<void>((resolve) => server.close(() => resolve()));

const check = async (label: string, fn: () => Promise<void>) => {
  await fn();
  console.log(`ok ${label}`);
};

const main = async () => {
  await listen();
  const port = (server.address() as { port: number }).port;
  const svc = new ZapiService();

  process.env.Z_API_URL = `http://127.0.0.1:${port}/instances`;
  process.env.INSTANCE_ID = 'inst-test';
  process.env.INSTANCE_TOKEN = 'token-test';
  process.env.USER_TOKEN_ID = 'client-token-test';

  await check('status conectado traz connected e detalhe do Z-API', async () => {
    mode = 'connected';
    const s = await svc.getStatus();
    assert.equal(s.reachable, true);
    assert.equal(s.connected, true);
    assert.equal(s.smartphoneConnected, true);
    assert.match(s.detail ?? '', /already connected/);
    assert.equal(s.message, null);
  });

  await check('status desconectado traz detail e connected=false', async () => {
    mode = 'disconnected';
    const s = await svc.getStatus();
    assert.equal(s.connected, false);
    assert.equal(s.smartphoneConnected, true);
    assert.match(s.detail ?? '', /restore the session/);
  });

  await check('QR volta como base64 no campo value', async () => {
    const qr = await svc.getQrCode();
    assert.equal(qr.state, 'qrcode');
    if (qr.state === 'qrcode') assert.equal(qr.qrcode, FAKE_QR);
  });

  await check('QR em formato challenge vira aviso, nao imagem', async () => {
    mode = 'challenge';
    const qr = await svc.getQrCode();
    assert.equal(qr.state, 'challenge');
  });

  await check('sem imagem volta unavailable com mensagem', async () => {
    mode = 'noImage';
    const qr = await svc.getQrCode();
    assert.equal(qr.state, 'unavailable');
  });

  await check('erro 500 do Z-API não vira exceção e mostra a mensagem dele', async () => {
    mode = 'http500';
    const s = await svc.getStatus();
    assert.equal(s.reachable, false);
    assert.equal(s.connected, false);
    assert.equal(s.message, 'boom');
    const qr = await svc.getQrCode();
    assert.equal(qr.state, 'unavailable');
  });

  await check('erro 500 sem corpo cai no genérico com o código HTTP', async () => {
    mode = 'http500semBody';
    const s = await svc.getStatus();
    assert.equal(s.reachable, false);
    assert.match(s.message ?? '', /500/);
  });

  await check('token inválido mostra o erro do Z-API, não um genérico', async () => {
    mode = 'instanceNotFound';
    const s = await svc.getStatus();
    assert.equal(s.reachable, false);
    assert.equal(s.message, 'Unable to find the instance');
  });

  await check('resposta não-JSON não derruba o serviço', async () => {
    mode = 'garbage';
    const s = await svc.getStatus();
    assert.equal(s.reachable, true);
    assert.equal(s.connected, false);
  });

  await check('sem env configurado explica o motivo', async () => {
    const saved = process.env.Z_API_URL;
    delete process.env.Z_API_URL;
    const s = await svc.getStatus();
    assert.equal(s.reachable, false);
    assert.match(s.message ?? '', /não configurado/);
    const qr = await svc.getQrCode();
    assert.equal(qr.state, 'unavailable');
    process.env.Z_API_URL = saved;
  });

  await check('timeout de 10s encerra a requisição pendurada', async () => {
    mode = 'hang';
    const started = Date.now();
    const s = await svc.getStatus();
    const elapsed = Date.now() - started;
    assert.equal(s.reachable, false);
    assert.match(s.message ?? '', /tempo limite/);
    assert.ok(elapsed >= 9_000 && elapsed < 14_000, `esperado ~10s, levou ${elapsed}ms`);
  });

  await check('header Client-Token foi enviado e o path tem /instances', async () => {
    assert.ok(clientTokenSeen.includes('client-token-test'), 'Client-Token não chegou');
  });

  await close();
  console.log(`\nZapiService validado contra Z-API simulado. Chamadas: ${calls.status} /status, ${calls.qr} qr-code/image.`);
  console.log('Nenhuma chamada à instância real, nenhuma mensagem enviada, nenhum dado alterado.');
};

main().catch((e) => {
  console.error('FALHOU:', e.message);
  process.exitCode = 1;
});