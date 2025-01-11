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

export enum CivilStatus {
    SOLTEIRO = "SINGLE",
    CASADO = "MARRIED",
    DIVORCIADO = "DIVORCED",
    VIUVO = "WIDOWED",
}

export enum Gender {
    MALE = "MALE",
    FEMALE = "FEMALE",
}

export class CreateParticipantDto {
    // Pessoal
    @IsNotEmpty({ message: 'Campo nome é obrigatório' })
    @IsString({ message: 'Campo nome deve ser do tipo texto' })
    name: string;

    @IsNotEmpty({ message: 'Campo data de nascimento é obrigatório' })
    @Type(() => Date)
    @IsDate({ message: 'Campo data de nascimento deve ser uma data válida' })
    birthDate: Date;

    @IsNotEmpty({ message: 'Campo gênero é obrigatório' })
    @Transform(({ value }) => value.toUpperCase())
    @IsEnum(Gender, { message: `Campo gênero deve ser válido. [ ${Object.values(Gender).join(' | ')} ]` })
    gender: Gender;

    @IsNotEmpty({ message: 'Campo estado civil é obrigatório' })
    @Transform(({ value }) => value.toUpperCase())
    @IsEnum(CivilStatus, { message: `Campo estado civil deve ser válido. [ ${Object.values(CivilStatus).join(' | ')} ]` })
    civilStatus: CivilStatus;

    @IsNotEmpty({ message: 'Campo idiomas é obrigatório' })
    @IsArray({ message: 'Campo idiomas deve ser uma lista' })
    @IsString({ each: true, message: 'Os itens de idiomas devem ser textos' })
    @Transform(({ value }) => value.map((v: string) => v.toUpperCase()))
    languages: string[];

    @IsNotEmpty({ message: 'Campo endereço é obrigatório' })
    @IsString({ message: 'Campo endereço deve ser do tipo texto' })
    address: string;

    @IsNotEmpty({ message: 'Campo cidade é obrigatório' })
    @IsString({ message: 'Campo cidade deve ser do tipo texto' })
    city: string;

    @IsNotEmpty({ message: 'Campo estado é obrigatório' })
    @IsString({ message: 'Campo estado deve ser do tipo texto' })
    @Transform(({ value }) => value.toUpperCase())
    state: string;

    @IsNotEmpty({ message: 'Campo CEP é obrigatório' })
    @IsString({ message: 'Campo CEP deve ser do tipo texto' })
    zipCode: string;

    @IsNotEmpty({ message: 'Campo telefone é obrigatório' })
    @IsString({ message: 'Campo telefone deve ser do tipo texto' })
    phone: string;

    @IsNotEmpty({ message: 'Campo email é obrigatório' })
    @IsEmail({}, { message: 'Campo email deve ser um email válido' })
    email: string;

    // Espiritual
    @IsNotEmpty({ message: 'Campo congregação é obrigatório' })
    @IsString({ message: 'Campo congregação deve ser do tipo texto' })
    congregation: string;

    @IsNotEmpty({ message: 'Campo data de batismo é obrigatório' })
    @IsDate({ message: 'Campo data de batismo deve ser uma data válida' })
    @Type(() => Date)
    baptismDate: Date;

    @IsOptional()
    @IsArray({ message: 'Campo atribuições deve ser uma lista' })
    @IsString({ each: true, message: 'Os itens de atribuições devem ser textos' })
    @Transform(({ value }) => value.map((v: string) => v.toUpperCase()))
    attributions?: string[];

    // Outros
    @IsNotEmpty({ message: 'Campo possui filho menor é obrigatório' })
    @IsBoolean({ message: 'Campo possui filho menor deve ser booleano' })
    hasMinorChild: boolean;

    @IsNotEmpty({ message: 'Campo cônjuge participante é obrigatório' })
    @IsBoolean({ message: 'Campo cônjuge participante deve ser booleano' })
    spouseParticipant: boolean;

    @IsOptional()
    @IsObject({ message: 'Campo disponibilidade deve ser um objeto' })
    availability?: {
        [day: string]: {
            morning: boolean;
            afternoon: boolean;
            evening: boolean;
        };
    };

    @IsOptional()
    @IsUUID(4, { message: "Campo id da petição deve ser um UUID v4 válido" })
    petitionId?: string;

    @IsOptional()
    @IsUrl({}, { message: "Campo image deve ser uma URL válida" })
    profilePhoto?: string;
}
