import { Type } from 'class-transformer';
import { Allow, ArrayMinSize, IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

/**
 * Bodies das rotas de escrita de designação, portados dos handlers da legacy
 * (`api/src/functions/designations/`).
 *
 * As mensagens de erro reproduzem as da legacy porque o front as mostra cruas
 * (ex.: `throw new BadRequestException("Status inválido")`).
 */

export class CreateDesignationQuery {
  @IsString({ message: 'groupId deve ser texto' })
  @IsNotEmpty({ message: 'Parâmetros inválidos' })
  groupId: string;
}

export class CancelDesignationDto {
  @IsString({ message: 'justification deve ser texto' })
  @IsNotEmpty({ message: 'Parâmetros inválidos' })
  justification: string;
}

export class UpdatePointStatusDto {
  /**
   * `@IsBoolean()` sem `@IsOptional()`: a legacy rejeitava `status === undefined`
   * com "Status inválido", mas aceitava `false` (que é o caso normal de
   * "desativar o ponto"). `@IsBoolean` não rejeita `false`.
   */
  @IsBoolean({ message: 'Status inválido' })
  status: boolean;
}

export class UpdateMandatoryPresenceDto {
  @IsBoolean({ message: 'Campo optional é obrigatório' })
  optional: boolean;
}

/**
 * `POST /designations/:id/send`.
 *
 * `optional` é opcional de propósito: a legacy só aplicava a mudança de
 * `mandatoryPresence` quando o campo chegava **e** era boolean
 * (`if (body?.optional !== undefined && typeof body.optional === "boolean")`).
 * Por isso aqui não há `@IsBoolean` — um valor não-booleano tem de ser aceito e
 * simplesmente ignorado, senão a paridade mudaria.
 */
export class SendDesignationDto {
  @IsOptional()
  @Allow()
  optional?: boolean;
}

export class PointParticipantsDto {
  @IsString()
  @IsNotEmpty({ message: 'Ponto inválido' })
  pointId: string;

  @IsArray()
  @IsString({ each: true })
  participantIds: string[];
}

/** Extensão para aplicar a sugestão inteira sem N requisições sequenciais. */
export class UpdateManyPointsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PointParticipantsDto)
  assignments: PointParticipantsDto[];

  @IsOptional()
  @IsString()
  filter?: string;
}

export class UpdatePointParticipantsDto {
  @IsArray({ message: 'participants deve ser uma lista' })
  @IsString({ each: true, message: 'participants deve conter apenas ids' })
  participants: string[];

  /**
   * O front manda `encodeURIComponent(searchTerm)` e a legacy usava a string
   * CRUA como regex, sem decodificar nem aplicar `trim`. Preservado de propósito:
   * normalizar aqui mudaria o que a tela de designação filtra.
   */
  @IsOptional()
  @IsString()
  filter?: string;
}
