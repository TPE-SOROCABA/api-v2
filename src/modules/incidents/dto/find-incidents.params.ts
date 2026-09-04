import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

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
