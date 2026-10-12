export interface JwtPayload {
  id: string; // ID do participante
  name: string;
  cpf?: string;
  profile: 'COORDINATOR' | 'ASSISTANT_COORDINATOR' | 'CAPTAIN' | 'ASSISTANT_CAPTAIN' | 'PARTICIPANT' | 'ADMIN_ANALYST';
  profile_photo?: string;
  groupId?: string;
  designation?: {
    id: string;
    expiration: string;
    name: string;
  };
  /**
   * Token de verificação por código (emitido por /auth/login-code): tem
   * `phone`/`code` em vez de `id`/`profile`. Serve para provar a posse do
   * telefone antes da redefinição de senha. Mesmo JWT_SECRET, formato
   * diferente — daí os campos opcionais aqui.
   */
  phone?: string;
  code?: string;
  iat: number; // issued at
  exp: number; // expiration
}

export interface AuthenticatedRequest {
  user: JwtPayload;
}

/**
 * Rota `@Public()`: `user` só existe se quem chamou mandou token. O AuthGuard anexa
 * quando há token válido e simplesmente segue sem ele quando não há — então quem
 * consome precisa tratar como opcional.
 */
export interface MaybeAuthenticatedRequest {
  user?: JwtPayload;
}
