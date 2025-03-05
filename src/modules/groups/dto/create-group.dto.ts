import { IsString, IsInt, IsOptional, IsEnum, ValidateNested, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { GroupStatus, GroupType, Weekday } from '@prisma/client';
import { AdditionalInfoDto } from './additional-info.dto';

export class CreateGroupDto {
    @IsString()
    name: string;

    @IsString()
    configEndHour: string;

    @IsInt()
    @Type(() => Number)
    configMax: number;

    @IsInt()
    @Type(() => Number)
    configMin: number;

    @IsString()
    configStartHour: string;

    @IsEnum(Weekday)
    configWeekday: Weekday;

    @IsEnum(GroupStatus)
    status: GroupStatus;

    @IsEnum(GroupType)
    type: GroupType;

    @IsNotEmpty({ message: 'ID do coordenador é obrigatório' })
    @IsString()
    coordinatorId: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => AdditionalInfoDto)
    additionalInfo: AdditionalInfoDto = new AdditionalInfoDto();
}
