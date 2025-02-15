import { PetitionStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsOptional, IsEnum, IsString } from 'class-validator';

export class FindAllParams {
  @IsOptional()
  @Transform(({ value }) => value.toUpperCase())
  @IsEnum(PetitionStatus, { message: `Valor inválido para status.` })
  status: PetitionStatus;

  @IsOptional()
  @IsString( { message: 'Campo participant deve ser uma string' })
  search: string;
}
