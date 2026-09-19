import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { ParticipantSex } from '@prisma/client';

export class FindWaitlistParams {
  @IsOptional()
  @IsString({ message: 'name deve ser texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value) || undefined)
  name?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsEnum(ParticipantSex, { message: 'sex inválido' })
  sex?: ParticipantSex;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'congregationId deve ser inteiro' })
  congregationId?: number;

  @IsOptional()
  @IsString({ message: 'groupId deve ser texto' })
  groupId?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean({ message: 'trainingValid deve ser booleano' })
  trainingValid?: boolean;
}
