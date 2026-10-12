/**
 * Paridade do contrato de auth entre a legacy e o api-v2.
 *
 * Rodar: npx ts-node -T scripts/check-auth-parity.ts
 *
 * Não toca no banco: só compara hash e assinatura de token nos dois lados.
 * Se isso divergir, o token emitido por um projeto não vale no outro e o
 * login quebra silenciosamente quando o switch do front for feito.
 */
import { createHash } from 'crypto';
import { sign, verify } from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'tpe-sorocaba';
const PASSWORD = 'senha-de-teste-123';

// --- implementações da legacy (api/src/domain/Login.ts), copiadas literalmente ---
const legacyEncrypt = (password: string) => createHash('sha256').update(password).digest('hex');
const legacyCreateJWT = (payload: object) => sign(payload, SECRET, { expiresIn: '1d' } as any);

// --- o que o api-v2 realmente usa (src/modules/auth/login.utils.ts) ---
import { LoginUtils } from '../src/modules/auth/login.utils';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FALHA'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

console.log('\n== hash da senha ==');
const mine = LoginUtils.encryptPassword(PASSWORD);
const theirs = legacyEncrypt(PASSWORD);
check('sha256 idêntico', mine === theirs, `${mine.slice(0, 16)}…`);

console.log('\n== assinatura do token ==');
const payload = { id: '38ce5ac6-0000-0000-0000-000000000000', name: 'Teste', profile: 'COORDINATOR' };
const tokenFromMine = LoginUtils.createJWT(payload);

// token emitido pelo api-v2, validado com a lógica da legacy
const verifiedByLegacy = verify(tokenFromMine, SECRET) as any;
check('api-v2 -> validado pela legacy', verifiedByLegacy.id === payload.id, `exp=${verifiedByLegacy.exp}`);

// token emitido pela legacy, validado pelo AuthGuard do api-v2
const tokenFromLegacy = legacyCreateJWT(payload);
const verifiedByMine = verify(tokenFromLegacy, process.env.JWT_SECRET || 'tpe-sorocaba') as any;
check('legacy -> validado pelo api-v2', verifiedByMine.id === payload.id);

console.log('\n== expiração ==');
const ttlDays = (verifiedByLegacy.exp - verifiedByLegacy.iat) / 86400;
check('expira em 1 dia', Math.abs(ttlDays - 1) < 0.01, `${ttlDays.toFixed(3)} dias`);

console.log(failed === 0 ? '\nTudo em paridade.\n' : `\n${failed} verificação(ões) falharam.\n`);
process.exit(failed === 0 ? 0 : 1);
