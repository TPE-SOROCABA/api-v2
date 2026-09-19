import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsIn, IsString, ValidateNested } from 'class-validator';

class CandidateDto {
  @IsString()
  id: string;

  // Vem tal qual a legacy já manda pro front (types/designation-participants.ts:
  // Profile / Sex) — evita reimplementar aqui a regra de quem é capitão/coordenador
  // (isso é decidido pela legacy, o front só repassa o que já tem em mãos).
  @IsIn(['ADMIN_ANALYST', 'CAPTAIN', 'COORDINATOR', 'PARTICIPANT', 'ASSISTANT_CAPTAIN', 'ASSISTANT_COORDINATOR'])
  profile: string;

  @IsIn(['MALE', 'FEMALE'])
  sex: string;
}

/**
 * Pool completo de candidatos elegíveis pra essa designação (quem já está
 * designado num ponto + quem ainda está na lista de disponíveis) — o mesmo
 * conjunto que a legacy usa no "Designação Automática". O front já tem esses
 * dados prontos em `designationData` (evita reimplementar aqui a regra de
 * elegibilidade — petição, disponibilidade etc. — que vive só na legacy).
 */
export class SuggestAssignmentDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CandidateDto)
  participants: CandidateDto[];
}
