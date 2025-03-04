import { Exclude, Expose, Transform, Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested } from 'class-validator';
import { AddressDto } from './address.dto';

@Exclude()
export class AdditionalInfoDto {
    @Expose()
    @IsOptional()
    @ValidateNested()
    @Type(() => AddressDto)
    @Transform(({ value }) => value ?? new AddressDto(), { toPlainOnly: true })
    address: AddressDto = new AddressDto();

    @Expose()
    @IsOptional()
    @IsString()
    @Transform(({ value }) => value === undefined ? '' : value, { toPlainOnly: true })
    observation: string = '';
}
