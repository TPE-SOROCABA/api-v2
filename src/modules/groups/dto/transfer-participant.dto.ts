import { IsString, MinLength } from 'class-validator';

export class TransferParticipantDto {
    /** grupo de onde a pessoa sai (o de destino vem na URL) */
    @IsString({ message: 'fromGroupId deve ser texto' })
    @MinLength(1, { message: 'Informe o grupo de origem' })
    fromGroupId: string;
}
