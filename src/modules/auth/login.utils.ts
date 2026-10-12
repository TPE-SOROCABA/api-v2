import { createHash } from 'crypto';
import { SignOptions, sign } from 'jsonwebtoken';

/**
 * Portado de `api/src/domain/Login.ts` (legacy).
 *
 * ⚠️ O hash é SHA-256 puro, sem salt e sem custo — é fraco de propósito
 * (compatibilidade com as senhas já gravadas na tabela `auths`, que é
 * compartilhada entre os dois projetos). Não "melhore" aqui sem antes planejar
 * a migração das senhas: mudar o algoritmo trava o login de todo mundo.
 *
 * O segredo é o mesmo `JWT_SECRET` dos dois lados, e é por isso que um token
 * emitido pela legacy continua funcionando no api-v2 (e vice-versa).
 */
export class LoginUtils {
  static encryptPassword(password: string): string {
    return createHash('sha256').update(password).digest('hex');
  }

  static createJWT(payload: object, options: SignOptions = { expiresIn: '1d' }): string {
    return sign(payload, process.env.JWT_SECRET || 'tpe-sorocaba', options);
  }
}
