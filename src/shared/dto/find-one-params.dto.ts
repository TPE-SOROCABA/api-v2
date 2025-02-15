import { IsUUID } from 'class-validator';

export class FindOneParams {
  @IsUUID('4', { message: 'Valor inválido para id' })
  id: string;
}
