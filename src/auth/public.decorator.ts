import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Libera a rota do AuthGuard global (que é `APP_GUARD`, ou seja, alcança tudo).
 *
 * Usar só no que realmente é público — login, recuperação de senha, health check.
 * Qualquer rota que dependa de `request.user` precisa continuar sem isto.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
