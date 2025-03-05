import { ParticipantGroupProfile } from "@prisma/client";
import { IsEnum, IsNotEmpty } from "class-validator";

export class UpdateGroupParticipanteProfileDto {
    @IsNotEmpty({ message: 'Campo perfil é obrigatório' })
    @IsEnum(Object.keys(ParticipantGroupProfile).map((key) => ParticipantGroupProfile[key]), { message: 'Campo perfil deve ser um dos valores: ' + Object.keys(ParticipantGroupProfile).map((key) => ParticipantGroupProfile[key]).join(', ') })
    profile: ParticipantGroupProfile;
}
