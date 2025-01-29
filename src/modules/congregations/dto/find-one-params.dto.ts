import { IsOptional, IsString } from 'class-validator';

export class FindAllParams {
  @IsOptional()
  @IsString({ message: 'O nome da congregação deve ser uma string' })
  name?: string;
}
