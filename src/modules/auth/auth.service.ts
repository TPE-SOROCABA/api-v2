import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DesignationStatus, ParticipantGroupProfile, ParticipantProfile, Weekday } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { SqsDispatcherService } from 'src/infra/sqs/sqs-dispatcher.service';
import { MessageGeneratorService, MessageType } from 'src/shared/message-generator.service';
import { JwtPayload } from 'src/shared/types/jwt.types';
import { LoginCodeDto, LoginDto, RecoverPasswordDto, ResetPasswordDto } from './dto/auth.dto';
import { LoginUtils } from './login.utils';

/** Depois de 3 erros seguidos, o login exige redefinição de senha (mesma regra da legacy). */
const MAX_LOGIN_ATTEMPTS = 3;
/** Validade do código de recuperação: 5 minutos. */
const CODE_TTL_MS = 5 * 60 * 1000;

/** Nest não tem 429 pronto; a legacy respondia 429 no bloqueio por tentativas. */
const tooManyAttempts = () => new HttpException('Muitas tentativas incorretas. Por favor, redefina sua senha.', HttpStatus.TOO_MANY_REQUESTS);

type ParticipantWithAuth = {
  id: string;
  name: string;
  cpf: string | null;
  profilePhoto: string | null;
  profile: ParticipantProfile | null;
  auth: { password: string; loginAttempts: number; resetPasswordCode: string | null; expiredAt: Date | null } | null;
  participantsGroup: { groupId: string; profile: ParticipantGroupProfile }[];
};

/**
 * Auth portada de `api/src/functions/auth/` (legacy).
 *
 * Não há Cognito: a senha é SHA-256 na tabela `auths` (compartilhada com a
 * legacy) e o token é JWT assinado com o mesmo `JWT_SECRET`. É por isso que
 * trocar o switch do front para cá não derruba ninguém logado.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly messageGenerator = new MessageGeneratorService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly sqs: SqsDispatcherService,
  ) {}

  // ---------------------------------------------------------------- login

  async login(dto: LoginDto): Promise<{ token: string }> {
    const participant = await this.findByPhone(dto.phone, true);

    if (!participant?.auth) {
      this.logger.warn(`Usuário ${dto.phone} não encontrado`);
      throw new UnauthorizedException('Usuário não encontrado');
    }

    if (participant.auth.loginAttempts > MAX_LOGIN_ATTEMPTS) {
      throw tooManyAttempts();
    }

    if (participant.auth.password !== LoginUtils.encryptPassword(dto.password)) {
      const updated = await this.prisma.auth.update({
        where: { participantId: participant.id },
        data: { loginAttempts: { increment: 1 } },
        select: { loginAttempts: true },
      });
      this.logger.warn(`Senha incorreta para ${dto.phone} (tentativa ${updated.loginAttempts})`);

      if (updated.loginAttempts > MAX_LOGIN_ATTEMPTS) {
        throw tooManyAttempts();
      }
      throw new UnauthorizedException('Senha inválida');
    }

    if (participant.auth.loginAttempts > 0) {
      await this.prisma.auth.update({ where: { participantId: participant.id }, data: { loginAttempts: 0 } });
    }

    const profile = this.resolveProfile(participant);
    this.assertCanLogin(profile, participant.name);

    const payload = await this.buildPayload(participant, profile);
    this.logger.log(`Usuário ${payload.name} logado (${profile})`);
    return { token: LoginUtils.createJWT(payload) };
  }

  // ----------------------------------------------------------- login-code

  async loginCode(dto: LoginCodeDto): Promise<{ token: string }> {
    const participant = await this.findByPhone(dto.phone, true);

    if (!participant?.auth?.expiredAt) {
      throw new NotFoundException('Usuário não encontrado ou código de recuperação inválido');
    }
    if (participant.auth.resetPasswordCode !== dto.code) {
      throw new BadRequestException('Código de recuperação inválido');
    }
    if (new Date() > participant.auth.expiredAt) {
      throw new BadRequestException('Código de recuperação expirado');
    }

    const profile = this.resolveProfile(participant);
    this.assertCanLogin(profile, participant.name);

    const payload = await this.buildPayload(participant, profile);
    this.logger.log(`Usuário ${payload.name} entrou pelo código de recuperação (${profile})`);
    return { token: LoginUtils.createJWT(payload) };
  }

  // ------------------------------------------------------ recover-password

  async recoverPassword(dto: RecoverPasswordDto): Promise<{ message: string }> {
    const participant = await this.findByPhone(dto.phone, false);

    if (!participant) {
      this.logger.warn(`[AUTH-RECOVER] Telefone ${dto.phone} não encontrado`);
      throw new NotFoundException('Usuário não encontrado');
    }

    const profile = this.resolveProfile(participant);
    this.assertCanLogin(profile, participant.name);

    const code = this.generateCode();

    await this.prisma.auth.update({
      where: { participantId: participant.id },
      data: {
        resetPasswordCode: String(code),
        updatedAt: new Date(),
        expiredAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });

    const message = this.messageGenerator.generate(MessageType.OTP_SIMPLE, {
      recipientName: participant.name.split(' ')[0],
      code: String(code),
    });

    // o envio real acontece no consumidor da fila, que continua na legacy
    await this.sqs.dispatch({
      phone: participant.phone,
      message,
      code: String(code),
      title: '*TPE Digital - Recuperação de senha*',
      type: 'otp',
    });

    this.logger.log(`[AUTH-RECOVER] OTP gerado para ${participant.name}, expirando em 5 min`);
    return { message: 'Código de recuperação enviado com sucesso' };
  }

  // --------------------------------------------------------- reset-password

  async resetPassword(dto: ResetPasswordDto, actor: Partial<JwtPayload>): Promise<{ message: string }> {
    const participant = await this.findByPhone(dto.phone, false);

    // login-code e login retornam o mesmo token de sessão na legacy. Vincular
    // pelo id preserva esse contrato sem permitir redefinir a senha de outro.
    if (!participant || !actor?.id || actor.id !== participant.id) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const profile = this.resolveProfile(participant);
    this.assertCanLogin(profile, participant.name);

    await this.prisma.auth.update({
      where: { participantId: participant.id },
      data: {
        password: LoginUtils.encryptPassword(dto.password),
        expiredAt: null,
        updatedAt: new Date(),
        resetPasswordCode: null,
        loginAttempts: 0,
      },
    });

    this.logger.log(`[AUTH-RESET] Senha redefinida para ${participant.name}`);
    return { message: 'Senha redefinida com sucesso' };
  }

  // ----------------------------------------------------------------- Helpers

  private async findByPhone(phone: string, withAuth: boolean): Promise<(ParticipantWithAuth & { phone: string }) | null> {
    return this.prisma.participants.findUnique({
      where: { phone },
      select: {
        id: true,
        name: true,
        phone: true,
        cpf: true,
        profilePhoto: true,
        profile: true,
        ...(withAuth && {
          auth: {
            select: { password: true, loginAttempts: true, resetPasswordCode: true, expiredAt: true },
          },
        }),
        participantsGroup: { select: { groupId: true, profile: true } },
      },
    }) as Promise<(ParticipantWithAuth & { phone: string }) | null>;
  }

  /**
   * Quem a pessoa é para fins de acesso: coordinator/analyst vem do perfil global;
   * captain/assistant vem do cargo no grupo. Sem nenhum dos dois, PARTICIPANT.
   */
  private resolveProfile(participant: Pick<ParticipantWithAuth, 'profile' | 'participantsGroup'>): ParticipantProfile {
    if (participant.profile === ParticipantProfile.COORDINATOR || participant.profile === ParticipantProfile.ADMIN_ANALYST) {
      return participant.profile;
    }
    const groupRole = participant.participantsGroup.find((pg) => pg.profile === ParticipantGroupProfile.CAPTAIN || pg.profile === ParticipantGroupProfile.ASSISTANT_CAPTAIN);
    return (groupRole?.profile as ParticipantProfile) ?? ParticipantProfile.PARTICIPANT;
  }

  private assertCanLogin(profile: ParticipantProfile, name: string): void {
    if (profile === ParticipantProfile.PARTICIPANT) {
      this.logger.warn(`Usuário ${name} não tem perfil de acesso`);
      throw new ForbiddenException('Usuário não tem permissão para logar');
    }
  }

  private async buildPayload(participant: ParticipantWithAuth & { phone: string }, profile: ParticipantProfile): Promise<JwtPayload> {
    const groupId = participant.participantsGroup[0]?.groupId;

    return {
      name: participant.name,
      cpf: participant.cpf ?? '',
      profile,
      profile_photo: this.fakeImage(participant.profilePhoto, participant.name),
      groupId,
      id: participant.id,
      designation: groupId ? await this.currentDesignation(groupId) : null,
    } as JwtPayload;
  }

  /**
   * Avatar padrão quando o voluntário não tem foto. Mesmo gerador de avatar da
   * legacy para o token ficar idêntico dos dois lados.
   */
  private fakeImage(profilePhoto: string | null, name: string): string {
    return profilePhoto || `https://ui-avatars.com/api/?name=${name}&background=2d3477&color=fff`;
  }

  /**
   * Designação vigente do grupo, para o front mostrar o resumo da semana.
   * Query leve: só o que o front consome (id, nome do grupo e a próxima data).
   */
  private async currentDesignation(groupId: string): Promise<{ id: string; expiration: string; name: string } | null> {
    const designation = await this.prisma.designations.findFirst({
      where: { groupId, status: { not: DesignationStatus.ARCHIVED } },
      select: { id: true, group: { select: { name: true, configWeekday: true, configEndHour: true } } },
    });
    if (!designation) return null;

    return {
      id: designation.id,
      expiration: this.nextDate(designation.group.configWeekday, designation.group.configEndHour).toISOString(),
      name: designation.group.name,
    };
  }

  /**
   * Próxima ocorrência do dia/hora de fim do grupo a partir de hoje.
   * Portado de `Designation.getNextDate()` da legacy.
   */
  private nextDate(weekday: Weekday, endHour: string, today = new Date()): Date {
    const weekdayNumber = WEEKDAY_NUM[weekday];
    const next = new Date(today);
    next.setDate(today.getDate() + ((weekdayNumber + 7 - today.getDay()) % 7));
    next.setHours(Number(endHour.split(':')[0]));
    next.setMinutes(Number(endHour.split(':')[1]));

    if (next < today) {
      next.setDate(next.getDate() + 7);
    }
    return next;
  }

  private generateCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }
}

const WEEKDAY_NUM: Record<Weekday, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};
