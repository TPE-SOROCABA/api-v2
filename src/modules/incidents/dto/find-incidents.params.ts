import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class FindIncidentsParams {
  @IsOptional()
  @IsString({ message: 'groupId deve ser texto' })
  groupId?: string;

  @IsOptional()
  @IsString({ message: 'participantName deve ser texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value) || undefined)
  participantName?: string;

  @IsOptional()
  @IsString({ message: 'participantId deve ser texto' })
  participantId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateFrom deve ser yyyy-MM-dd' })
  dateFrom?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateTo deve ser yyyy-MM-dd' })
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page deve ser inteiro' })
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize deve ser inteiro' })
  @Min(1)
  @Max(250)
  pageSize: number = 50;
}
