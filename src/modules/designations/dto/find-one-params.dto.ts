import { IsUUID } from 'class-validator';

export class FindOneDesignationParams {
  @IsUUID()
  id: string;
}