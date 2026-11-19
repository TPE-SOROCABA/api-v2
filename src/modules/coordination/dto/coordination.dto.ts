import { ParticipantProfile, PetitionStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, ValidateNested, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value) || undefined;

/**
 * Perfis que o coordenador pode atribuir. O login da legacy só entende COORDINATOR e ADMIN_ANALYST
 * (perfil global) — capitão/assistente vêm do cargo no grupo — e barra PARTICIPANT (403). Por isso
 * ASSISTANT_COORDINATOR não entra: quem recebesse esse perfil não conseguiria logar.
 */
export const ASSIGNABLE_PROFILES = [ParticipantProfile.COORDINATOR, ParticipantProfile.ADMIN_ANALYST, ParticipantProfile.PARTICIPANT] as const;

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

  /** none = sem nenhuma data de treinamento; has = com data. Treinamento não tem validade. */
  @IsOptional()
  @IsIn(['none', 'has'], { message: 'training deve ser none ou has' })
  training?: 'none' | 'has';

  /** never = cadastro nunca atualizado; stale = nunca atualizou ou atualizou há mais de 6 meses */
  @IsOptional()
  @IsIn(['never', 'stale'], { message: 'profileUpdate deve ser never ou stale' })
  profileUpdate?: 'never' | 'stale';

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
  @IsIn([...ASSIGNABLE_PROFILES], { message: 'Perfil inválido. Use COORDINATOR, ADMIN_ANALYST ou PARTICIPANT' })
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

export class UpdateGroupSendDto {
  @IsBoolean({ message: 'enabled deve ser verdadeiro ou falso' })
  enabled: boolean;
}

const SUPPLY_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

/** Um mês do rodízio de café/limpeza (Centro). `morning` = o que o grupo da manhã cuida; a tarde cuida do outro. */
export class SupplyMonthDto {
  @IsInt({ message: 'year deve ser inteiro' })
  @Min(2024)
  @Max(2100)
  year: number;

  @IsInt({ message: 'month deve ser inteiro' })
  @Min(1)
  @Max(12)
  month: number;

  @IsIn(SUPPLY_DAYS, { message: 'weekday deve ser de segunda a sábado (MONDAY..SATURDAY)' })
  weekday: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY';

  @IsIn(['CAFE', 'LIMPEZA'], { message: 'morning deve ser CAFE ou LIMPEZA' })
  morning: 'CAFE' | 'LIMPEZA';
}

export class SupplyBulkDto {
  @IsArray()
  @ArrayMaxSize(36)
  @ValidateNested({ each: true })
  @Type(() => SupplyMonthDto)
  months: SupplyMonthDto[];
}

export class SupplyGenerateDto extends SupplyMonthDto {
  /** quantos meses gerar a partir de year/month */
  @IsInt({ message: 'count deve ser inteiro' })
  @Min(1)
  @Max(24)
  count: number;
}

export class UpdateMenuPermissionsDto {
  /** { ADMIN_ANALYST: string[], CAPTAIN: string[], ASSISTANT_CAPTAIN: string[] } — validado no SettingsService */
  @IsObject({ message: 'permissions deve ser um objeto' })
  permissions: Record<string, string[]>;
}

/** Período (em meses) do histórico/rotatividade. */
export class FindHistoryParams {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'months deve ser inteiro' })
  @Min(1)
  @Max(36)
  months?: number;

  /** rotatividade: só quem trabalhou em pelo menos N grupos (padrão 2) */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'minGroups deve ser inteiro' })
  @Min(1)
  @Max(10)
  minGroups?: number;
}
