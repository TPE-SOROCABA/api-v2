import { Body, Controller, HttpCode, HttpStatus, Post, Request } from '@nestjs/common';
import { Public } from 'src/auth/public.decorator';
import { AuthenticatedRequest } from 'src/shared/types';
import { AuthService } from './auth.service';
import { LoginCodeDto, LoginDto, RecoverPasswordDto, ResetPasswordDto } from './dto/auth.dto';

/**
 * Auth movida da legacy (`api/resources/auth.yml`).
 *
 * O AuthGuard é `APP_GUARD`, então tudo exige token por padrão — e é por isso
 * que existe `@Public()`. Mas `@Public()` não é "rotas do auth": login, código e
 * recuperação são públicos de verdade; redefinição de senha NÃO é (ver abaixo).
 *
 * Formato de resposta idêntico ao da legacy (`{ token }` / `{ message }`), para
 * o switch do front ser só trocar a URL base.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('login-code')
  @HttpCode(HttpStatus.OK)
  loginCode(@Body() dto: LoginCodeDto) {
    return this.authService.loginCode(dto);
  }

  @Public()
  @Post('recover-password')
  @HttpCode(HttpStatus.OK)
  recoverPassword(@Body() dto: RecoverPasswordDto) {
    return this.authService.recoverPassword(dto);
  }

  /**
   * NÃO é @Public(): exige token de sessão e só redefine a senha do seu titular.
   * login-code mantém o mesmo payload do login, inclusive o id do participante.
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Request() req: AuthenticatedRequest, @Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto, req.user);
  }
}
