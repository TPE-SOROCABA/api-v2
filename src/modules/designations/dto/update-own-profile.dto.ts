import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
// campo opcional de texto: vazio vira null (limpa o dado)
const trimOrNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);

export class OwnAvailabilityDto {
  @IsInt({ message: 'weekDay deve ser inteiro' })
  @Min(0)
  @Max(6)
  weekDay: number;

  @IsBoolean() morning: boolean;
  @IsBoolean() afternoon: boolean;
  @IsBoolean() evening: boolean;
}

/**
 * O que a PESSOA pode atualizar sozinha pelo link da designação. O telefone NÃO está aqui de propósito:
 * ele é o login do sistema e o destino das mensagens, então só a coordenação troca. A ValidationPipe usa
 * `whitelist`, então qualquer outro campo enviado é descartado.
 */
export class UpdateOwnProfileDto {
  /** nome completo, em um campo só (nome e sobrenome) */
  @IsOptional()
  @IsString({ message: 'Nome deve ser texto' })
  @Transform(trim)
  @MinLength(5, { message: 'Informe nome e sobrenome' })
  @MaxLength(120, { message: 'Nome muito longo' })
  name?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Informe um e-mail válido' })
  @MaxLength(160, { message: 'E-mail muito longo' })
  email?: string;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(200, { message: 'Endereço muito longo' })
  address?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(80, { message: 'Cidade muito longa' })
  city?: string | null;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() || null : value))
  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: 'Estado deve ter 2 letras (ex.: SP)' })
  state?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @Matches(/^\d{5}-?\d{3}$/, { message: 'CEP inválido (ex.: 18000-000)' })
  zipCode?: string | null;

  /** yyyy-MM-dd */
  @IsOptional()
  @Transform(trimOrNull)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data de nascimento inválida' })
  birthDate?: string | null;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() || null : value))
  @IsIn(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', null], { message: 'Estado civil inválido' })
  civilStatus?: 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED' | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => OwnAvailabilityDto)
  availability?: OwnAvailabilityDto[];
}
