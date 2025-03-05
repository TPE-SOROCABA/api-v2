import {
    IsNotEmpty,
    IsString,
    IsOptional,
    IsEmail,
    IsEnum,
} from "class-validator";
import { Transform } from "class-transformer";
import { ParticipantProfile } from "@prisma/client";

export class FindAllParticipantParams {
    @IsOptional()
    @IsString({ message: 'Campo nome deve ser do tipo texto' })
    name?: string;

    @IsOptional()
    @IsString({ message: 'Campo telefone deve ser do tipo texto' })
    @Transform(({ value }) => value?.replace(/[^0-9]/g, ''))
    phone?: string;

    @IsOptional()
    @IsEmail({}, { message: 'Campo email deve ser um email válido' })
    email?: string;

    @IsOptional()
    @IsEnum(Object.keys(ParticipantProfile).map((key) => ParticipantProfile[key]), { message: 'Campo perfil deve ser um dos valores: ' + Object.keys(ParticipantProfile).map((key) => ParticipantProfile[key]).join(', ') })
    profile?: ParticipantProfile;
}
