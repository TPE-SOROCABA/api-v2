import { IsString, IsInt, IsOptional, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Weekday } from '@prisma/client';
import { AdditionalInfoDto } from './additional-info.dto';

export class CreateGroupDto {
    @IsString()
    name: string;

    @IsString()
    config_end_hour: string;

    @IsInt()
    @Type(() => Number)
    config_max: number;

    @IsInt()
    @Type(() => Number)
    config_min: number;

    @IsString()
    config_start_hour: string;

    @IsEnum(Weekday)
    config_weekday: Weekday;

    @IsOptional()
    @IsString()
    coordinatorId?: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => AdditionalInfoDto)
    additionalInfo: AdditionalInfoDto = new AdditionalInfoDto();
}
