import { IsBoolean, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreatePointDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome do ponto é obrigatório' })
  pointName: string;

  @IsString()
  @IsNotEmpty({ message: 'Nome do carrinho é obrigatório' })
  cartName: string;

  @IsInt({ message: 'Quantidade mínima deve ser um número inteiro' })
  @Min(1, { message: 'Quantidade mínima deve ser pelo menos 1' })
  minParticipants: number;

  @IsInt({ message: 'Quantidade máxima deve ser um número inteiro' })
  @Min(1, { message: 'Quantidade máxima deve ser pelo menos 1' })
  maxParticipants: number;

  @IsBoolean({ message: 'Status deve ser verdadeiro ou falso' })
  status: boolean;
}