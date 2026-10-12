import { IncidentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';

/** Voluntário (ou capitão) registering a falta numa designação. */
export class CreateIncidentDto {
  /** Mesma regra da legacy: 3 a 255 caracteres. */
  @IsString({ message: 'O motivo deve ser uma sequência de caracteres' })
  @Length(3, 255, { message: 'O motivo deve ter entre 3 e 255 caracteres' })
  reason: string;
}

/** Edição do motivo/status da falta. Tudo opcional: o que não vier fica como está. */
export class UpdateIncidentDto {
  @IsOptional()
  @IsString({ message: 'O motivo deve ser uma sequência de caracteres' })
  @Length(3, 255, { message: 'O motivo deve ter entre 3 e 255 caracteres' })
  reason?: string;

  // a legacy só checava IsString e deixava o banco recusar valor inválido; aqui o
  // enum é validado na borda para a resposta de erro chegar antes de tocar no banco
  @IsOptional()
  @IsEnum(IncidentStatus, { message: 'status inválido' })
  status?: IncidentStatus;
}
