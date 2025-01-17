import { PetitionStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsOptional, IsEnum, IsString } from 'class-validator';

export class FindAllParams {
  @IsOptional()
  @Transform(({ value }) => value.toUpperCase())
  @IsEnum(PetitionStatus, { message: `Campo status deve ser válido. [ ${Object.values(PetitionStatus).join(' | ')} ]` })
  status: PetitionStatus;

  @IsOptional()
  @IsString( { message: 'Campo protocol deve ser uma string' })
  protocol: string;
}
