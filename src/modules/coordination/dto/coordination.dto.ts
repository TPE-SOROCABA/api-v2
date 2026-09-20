import { ParticipantProfile, PetitionStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value) || undefined;

/** Perfis que o coordenador pode atribuir (CAPTAIN/ASSISTANT_CAPTAIN globais são deprecated: cargo de capitão vive no grupo). */
export const ASSIGNABLE_PROFILES = [ParticipantProfile.COORDINATOR, ParticipantProfile.ASSISTANT_COORDINATOR, ParticipantProfile.ADMIN_ANALYST, ParticipantProfile.PARTICIPANT] as const;

export class FindPeopleParams {
  /** nome, telefone ou e-mail */
  @IsOptional()
  @IsString({ message: 'q deve ser texto' })
  @Transform(trim)
  q?: string;

  @IsOptional()
  @IsIn(Object.values(ParticipantProfile), { message: 'profile inválido' })
  profile?: ParticipantProfile;

  @IsOptional()
  @IsIn(Object.values(PetitionStatus), { message: 'petitionStatus inválido' })
  petitionStatus?: PetitionStatus;

  @IsOptional()
  @IsString({ message: 'groupId deve ser texto' })
  @Transform(trim)
  groupId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page deve ser inteiro' })
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize deve ser inteiro' })
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class UpdateProfileDto {
  @IsIn([...ASSIGNABLE_PROFILES], { message: 'Perfil inválido. Use COORDINATOR, ASSISTANT_COORDINATOR, ADMIN_ANALYST ou PARTICIPANT' })
  profile: (typeof ASSIGNABLE_PROFILES)[number];
}

export class UpdateTrainingDto {
  /** yyyy-MM-dd, ou null para remover a data de treinamento */
  @ValidateIf((o) => o.lastTrainingDate !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'lastTrainingDate deve estar no formato yyyy-MM-dd (ou null)' })
  lastTrainingDate: string | null;
}

export class UpdateAnnouncementDto {
  @IsBoolean({ message: 'enabled deve ser verdadeiro ou falso' })
  enabled: boolean;

  @IsString({ message: 'message deve ser texto' })
  @MaxLength(600, { message: 'O aviso pode ter no máximo 600 caracteres' })
  message: string;
}

export class UpdateWhatsappTemplateDto {
  @IsString({ message: 'message deve ser texto' })
  @MinLength(10, { message: 'A mensagem precisa ter pelo menos 10 caracteres' })
  @MaxLength(600, { message: 'A mensagem pode ter no máximo 600 caracteres' })
  message: string;
}
