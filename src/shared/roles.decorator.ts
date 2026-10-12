import { SetMetadata } from '@nestjs/common';
import { UserProfile } from './types';

export const ROLES_KEY = 'roles';

/**
 * Restringe uma rota (ou controller inteiro) aos perfis informados.
 * Aplicado pelo `RolesGuard`, que confere o perfil ATUAL no banco — não o do token.
 * Rota sem `@Roles` continua exigindo só um JWT válido, como sempre.
 */
export const Roles = (...profiles: UserProfile[]) => SetMetadata(ROLES_KEY, profiles);
