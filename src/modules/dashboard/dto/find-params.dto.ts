import { IsOptional, IsString } from 'class-validator';

export class FindAllParams {
  @IsOptional()
  @IsString({ message: 'O id do grupo deve ser uma string' })
  groupId?: string;
}
