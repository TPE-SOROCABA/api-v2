import { IsUUID } from 'class-validator';

export class FindOneParams {
  @IsUUID('4', { message: 'O ID deve ser um UUID válido' })
  id: string;
}
