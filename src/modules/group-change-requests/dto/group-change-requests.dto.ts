import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

/** Motivo do pedido (sempre registrado): horário, distância, saúde/família, trabalho/estudo, outro. */
export const CHANGE_REASONS = ['SCHEDULE', 'DISTANCE', 'HEALTH_FAMILY', 'WORK_STUDY', 'OTHER'] as const;
export const PERIODS = ['morning', 'afternoon', 'evening'] as const;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value) || undefined;

export class DesiredSlotDto {
  /** 0 = domingo ... 6 = sábado (mesmo formato da disponibilidade) */
  @IsInt({ message: 'weekDay deve ser um número de 0 a 6' })
  @Min(0)
  @Max(6)
  weekDay: number;

  @IsIn([...PERIODS], { message: 'period deve ser morning, afternoon ou evening' })
  period: (typeof PERIODS)[number];
}

export class CreateChangeRequestDto {
  @IsString({ message: 'participantId deve ser texto' })
  participantId: string;

  /** dia(s) e horário(s) em que a pessoa quer ir se abrir vaga */
  @IsArray({ message: 'desiredSlots deve ser uma lista' })
  @ArrayMinSize(1, { message: 'Informe pelo menos um dia e horário desejado' })
  @ArrayMaxSize(21)
  @ValidateNested({ each: true })
  @Type(() => DesiredSlotDto)
  desiredSlots: DesiredSlotDto[];

  @IsIn([...CHANGE_REASONS], { message: 'Informe o motivo do pedido' })
  reason: (typeof CHANGE_REASONS)[number];

  @IsOptional()
  @IsString({ message: 'note deve ser texto' })
  @MaxLength(300, { message: 'A observação pode ter no máximo 300 caracteres' })
  @Transform(trim)
  note?: string;
}

export class FindChangeRequestsParams {
  @IsOptional()
  @IsIn(['OPEN', 'DONE', 'CANCELLED', 'ALL'], { message: 'status inválido' })
  status?: 'OPEN' | 'DONE' | 'CANCELLED' | 'ALL';

  @IsOptional()
  @IsString({ message: 'participantId deve ser texto' })
  participantId?: string;

  /** só pedidos de quem está nesse grupo */
  @IsOptional()
  @IsString({ message: 'groupId deve ser texto' })
  groupId?: string;
}
