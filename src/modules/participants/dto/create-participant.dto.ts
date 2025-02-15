import {
    IsNotEmpty,
    IsString,
    IsOptional,
    IsEmail,
    IsDate,
    IsEnum,
    IsBoolean,
    IsArray,
    IsUUID,
    IsUrl,
    IsInt,
    ValidateNested,
} from "class-validator";
import { Type, Transform } from "class-transformer";
import { CivilStatus, ParticipantSex } from "@prisma/client";
import { BadRequestException } from "@nestjs/common";

export class CreateParticipantDto {
    // Pessoal
    @IsNotEmpty({ message: 'Campo nome é obrigatório' })
    @IsString({ message: 'Campo nome deve ser do tipo texto' })
    name: string;

    @IsNotEmpty({ message: 'Campo genero é obrigatório' })
    @Transform(({ value }) => value?.toUpperCase())
    @IsEnum(ParticipantSex, { message: `Valor inválido para genero` })
    sex: ParticipantSex;

    @IsNotEmpty({ message: 'Campo telefone é obrigatório' })
    @IsString({ message: 'Campo telefone deve ser do tipo texto' })
    @Transform(({ value }) => value?.replace(/[^0-9]/g, ''))
    phone: string;

    @IsNotEmpty({ message: 'Campo email é obrigatório' })
    @IsEmail({}, { message: 'Campo email deve ser um email válido' })
    email: string;

    @IsNotEmpty({ message: 'Campo id da petição é obrigatório' })
    @IsUUID(4, { message: "Valor inválido para id da petição" })
    petitionId: string;

    @IsOptional()
    @Type(() => Date)
    @IsDate({ message: 'Campo data de nascimento deve ser uma data válida' })
    @Transform(({ value }) => {
        const date = new Date(value);
        const today = new Date();
        const age = today.getFullYear() - date.getFullYear();
        const monthDiff = today.getMonth() - date.getMonth();
        const dayDiff = today.getDate() - date.getDate();
        if (date > today) {
            throw new Error('Campo data de nascimento não pode ser uma data futura');
        }
        if (age < 14 || (age === 14 && (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)))) {
            throw new BadRequestException('Campo data de nascimento deve ser de uma pessoa maior de 14 anos');
        }
        return date;
    })
    birthDate: Date;

    @IsOptional()
    @Transform(({ value }) => value?.toUpperCase())
    @IsEnum(CivilStatus, { message: `Valor inválido para estado civil` })
    civilStatus: CivilStatus;

    @IsOptional()
    @IsArray({ message: 'Campo idiomas deve ser uma lista' })
    @IsString({ each: true, message: 'Os itens de idiomas devem ser textos' })
    @Transform(({ value }) => value.map((v: string) => v?.toUpperCase()))
    languages: string[];

    @IsOptional()
    @IsString({ message: 'Campo endereço deve ser do tipo texto' })
    address: string;

    @IsOptional()
    @IsString({ message: 'Campo cidade deve ser do tipo texto' })
    city: string;

    @IsOptional()
    @IsString({ message: 'Campo estado deve ser do tipo texto' })
    @Transform(({ value }) => value?.toUpperCase())
    state: string;

    @IsOptional()
    @IsString({ message: 'Campo CEP deve ser do tipo texto' })
    zipCode: string;

    // Espiritual
    @IsOptional()
    @IsInt({ message: 'Campo congregação deve ser do tipo inteiro' })
    congregationId: number;

    @IsOptional()
    @IsDate({ message: 'Campo data de batismo deve ser uma data válida' })
    @Type(() => Date)
    baptismDate: Date;

    @IsOptional()
    @IsArray({ message: 'Valor inválido para privilégios' })
    @IsString({ each: true, message: 'Os itens de privilégios devem ser textos' })
    @Transform(({ value }) => value.map((v: string) => v?.toUpperCase()))
    attributions?: string[];

    // Outros
    @IsOptional()
    @IsBoolean({ message: 'Campo possui filho menor deve ser booleano' })
    hasMinorChild: boolean;

    @IsOptional()
    @IsBoolean({ message: 'Campo cônjuge participante deve ser booleano' })
    spouseParticipant: boolean;

    @IsOptional()
    @IsArray({ message: 'Campo disponibilidade deve ser uma lista' })
    @ValidateNested({ each: true })
    @Type(() => AvailabilityItem)
    availability?: any[];

    @IsOptional()
    @IsUrl({}, { message: "Campo image deve ser uma URL válida" })
    profilePhoto?: string;
}

export class AvailabilityItem {
    @IsInt({ message: 'Valor inválido para dia da semana' })
    weekDay: number;

    @IsBoolean({ message: 'morning deve ser um valor booleano' })
    morning: boolean;

    @IsBoolean({ message: 'afternoon deve ser um valor booleano' })
    afternoon: boolean;

    @IsBoolean({ message: 'evening deve ser um valor booleano' })
    evening: boolean;
}

