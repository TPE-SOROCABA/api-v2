import {
    IsNotEmpty,
    IsString,
    IsOptional,
    IsEmail,
    IsDate,
    IsEnum,
    IsBoolean,
    IsArray,
    IsObject,
    IsUUID,
    IsUrl,
} from "class-validator";
import { Type, Transform } from "class-transformer";
import { CivilStatus, ParticipantSex } from "@prisma/client";
import { BadRequestException } from "@nestjs/common";

export class CreateParticipantDto {
    // Pessoal
    @IsNotEmpty({ message: 'Campo nome é obrigatório' })
    @IsString({ message: 'Campo nome deve ser do tipo texto' })
    name: string;

    @IsNotEmpty({ message: 'Campo sexo é obrigatório' })
    @Transform(({ value }) => value.toUpperCase())
    @IsEnum(ParticipantSex, { message: `Campo sexo deve ser válido. [ ${Object.values(ParticipantSex).join(' | ')} ]` })
    sex: ParticipantSex;

    @IsNotEmpty({ message: 'Campo telefone é obrigatório' })
    @IsString({ message: 'Campo telefone deve ser do tipo texto' })
    @Transform(({ value }) => value.replace(/[^0-9]/g, ''))
    phone: string;

    @IsNotEmpty({ message: 'Campo email é obrigatório' })
    @IsEmail({}, { message: 'Campo email deve ser um email válido' })
    email: string;

    @IsNotEmpty({ message: 'Campo id da petição é obrigatório' })
    @IsUUID(4, { message: "Campo id da petição deve ser um UUID v4 válido" })
    petitionId: string;

    @IsOptional({ message: 'Campo data de nascimento é obrigatório' })
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

    @IsOptional({ message: 'Campo estado civil é obrigatório' })
    @Transform(({ value }) => value.toUpperCase())
    @IsEnum(CivilStatus, { message: `Campo estado civil deve ser válido. [ ${Object.values(CivilStatus).join(' | ')} ]` })
    civilStatus: CivilStatus;

    @IsOptional({ message: 'Campo idiomas é obrigatório' })
    @IsArray({ message: 'Campo idiomas deve ser uma lista' })
    @IsString({ each: true, message: 'Os itens de idiomas devem ser textos' })
    @Transform(({ value }) => value.map((v: string) => v.toUpperCase()))
    languages: string[];

    @IsOptional({ message: 'Campo endereço é obrigatório' })
    @IsString({ message: 'Campo endereço deve ser do tipo texto' })
    address: string;

    @IsOptional({ message: 'Campo cidade é obrigatório' })
    @IsString({ message: 'Campo cidade deve ser do tipo texto' })
    city: string;

    @IsOptional({ message: 'Campo estado é obrigatório' })
    @IsString({ message: 'Campo estado deve ser do tipo texto' })
    @Transform(({ value }) => value.toUpperCase())
    state: string;

    @IsOptional({ message: 'Campo CEP é obrigatório' })
    @IsString({ message: 'Campo CEP deve ser do tipo texto' })
    zipCode: string;

    // Espiritual
    @IsOptional({ message: 'Campo congregação é obrigatório' })
    @IsString({ message: 'Campo congregação deve ser do tipo texto' })
    congregation: string;

    @IsOptional({ message: 'Campo data de batismo é obrigatório' })
    @IsDate({ message: 'Campo data de batismo deve ser uma data válida' })
    @Type(() => Date)
    baptismDate: Date;

    @IsOptional()
    @IsArray({ message: 'Campo atribuições deve ser uma lista' })
    @IsString({ each: true, message: 'Os itens de atribuições devem ser textos' })
    @Transform(({ value }) => value.map((v: string) => v.toUpperCase()))
    attributions?: string[];

    // Outros
    @IsOptional({ message: 'Campo possui filho menor é obrigatório' })
    @IsBoolean({ message: 'Campo possui filho menor deve ser booleano' })
    hasMinorChild: boolean;

    @IsOptional({ message: 'Campo cônjuge participante é obrigatório' })
    @IsBoolean({ message: 'Campo cônjuge participante deve ser booleano' })
    spouseParticipant: boolean;

    @IsOptional()
    @IsObject({ message: 'Campo disponibilidade deve ser um objeto' })
    @Transform(({ value }) => {
        const transformedValue = {};
        for (const key in value) {
            if (value.hasOwnProperty(key)) {
                transformedValue[key.toLowerCase()] = value[key];
            }
        }
        return transformedValue;
    })
    availability?: {
        [day: string]: {
            morning: boolean;
            afternoon: boolean;
            evening: boolean;
        };
    };

    @IsOptional()
    @IsUrl({}, { message: "Campo image deve ser uma URL válida" })
    profilePhoto?: string;
}
