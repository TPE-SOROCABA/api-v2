import { IsString, IsOptional, IsEmail, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { ParticipantProfile } from '@prisma/client';

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
  @IsEnum(Object.keys(ParticipantProfile).map((key) => ParticipantProfile[key]), {
    message:
      'Campo perfil deve ser um dos valores: ' +
      Object.keys(ParticipantProfile)
        .map((key) => ParticipantProfile[key])
        .join(', '),
  })
  profile?: ParticipantProfile;

  /**
   * Quando vem, `GET /participants` deixa de devolver a ficha completa e passa a
   * devolver só o que a tela de Designação consome (`id`, `name`, `phone`,
   * `profile_photo`, `profile` = cargo no grupo, `incident_history`).
   *
   * É o `GET /participants?groupId=` da legacy (`listParticipants.handler`), que
   * o `admin-tpe` ainda consumia. Sem esse desvio, apontar a tela para cá
   * quebraria: os dois formatos não são compatíveis.
   */
  @IsOptional()
  @IsString({ message: 'Campo groupId deve ser do tipo texto' })
  groupId?: string;

  /** Só faz sentido junto do `groupId` — é o filtro de nome da legacy. */
  @IsOptional()
  @IsString({ message: 'Campo filter deve ser do tipo texto' })
  filter?: string;
}
