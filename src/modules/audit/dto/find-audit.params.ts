import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value) || undefined;

export class FindAuditParams {
  @IsOptional()
  @IsString({ message: 'action deve ser texto' })
  @Transform(trim)
  action?: string;

  @IsOptional()
  @IsString({ message: 'entity deve ser texto' })
  @Transform(trim)
  entity?: string;

  @IsOptional()
  @IsString({ message: 'entityId deve ser texto' })
  @Transform(trim)
  entityId?: string;

  @IsOptional()
  @IsString({ message: 'actorId deve ser texto' })
  @Transform(trim)
  actorId?: string;

  /** busca por nome de quem fez ou do alvo */
  @IsOptional()
  @IsString({ message: 'q deve ser texto' })
  @Transform(trim)
  q?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateFrom deve estar no formato yyyy-MM-dd' })
  dateFrom?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateTo deve estar no formato yyyy-MM-dd' })
  dateTo?: string;

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
