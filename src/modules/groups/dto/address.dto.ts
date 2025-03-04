import { Exclude, Expose, Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

@Exclude()
export class AddressDto {
  @Expose()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value ?? '', { toPlainOnly: true })
  street: string = '';

  @Expose()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value ?? '', { toPlainOnly: true })
  number: string = '';

  @Expose()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value ?? '', { toPlainOnly: true })
  neighborhood: string = '';
}
