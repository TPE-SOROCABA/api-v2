import { IsString, Length, Matches } from 'class-validator';

/** Telefone brasileiro sem DDI: 11 dígitos (o front manda assim, já sem máscara). */
export const PHONE_11 = /^\d{11}$/;

export class LoginDto {
  @IsString({ message: 'O número de telefone deve ser uma sequência de números' })
  @Matches(PHONE_11, { message: 'O número de telefone deve ter 11 dígitos' })
  phone: string;

  @IsString({ message: 'A senha deve ser uma sequência de caracteres' })
  @Length(6, 16, { message: 'A senha deve ter entre 6 e 16 caracteres' })
  password: string;
}

export class LoginCodeDto {
  @IsString({ message: 'O número de telefone deve ser uma sequência de caracteres' })
  @Matches(PHONE_11, { message: 'O número de telefone deve ter 11 dígitos' })
  phone: string;

  @IsString({ message: 'O código deve ser uma sequência de caracteres' })
  @Length(6, 6, { message: 'O código deve ter exatamente 6 caracteres' })
  code: string;
}

export class RecoverPasswordDto {
  @IsString({ message: 'O número de telefone deve ser uma sequência de números' })
  @Matches(PHONE_11, { message: 'O número de telefone deve ter 11 dígitos' })
  phone: string;
}

export class ResetPasswordDto {
  @IsString({ message: 'O número de telefone deve ser uma sequência de números' })
  @Matches(PHONE_11, { message: 'O número de telefone deve ter 11 dígitos' })
  phone: string;

  @IsString({ message: 'A senha deve ser uma sequência de caracteres' })
  @Length(6, 16, { message: 'A senha deve ter entre 6 e 16 caracteres' })
  password: string;
}

export class LoginResponseDto {
  token: string;
}

export class MessageResponseDto {
  message: string;
}
