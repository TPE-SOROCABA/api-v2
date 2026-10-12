import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ParticipantProfile, Prisma } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { JwtPayload } from 'src/shared/types';
import { AuditAction, AuditService } from '../audit/audit.service';
import { FindPeopleParams, UpdateProfileDto, UpdateTrainingDto } from './dto/coordination.dto';

@Injectable()
export class PeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private looksLikePhone(q: string): boolean {
    return /^[\d\s()+-]+$/.test(q) && q.replace(/\D/g, '').length >= 3;
  }

  /** Busca de voluntários (nome, telefone ou e-mail) com o que o coordenador precisa ver de relance. */
  async findAll(params: FindPeopleParams) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;

    const where: Prisma.ParticipantsWhereInput = {
      ...(params.profile && { profile: params.profile }),
      ...(params.petitionStatus && { petitions: { status: params.petitionStatus } }),
      ...(params.groupId && { participantsGroup: { some: { groupId: params.groupId } } }),
      ...(params.q && {
        OR: [
          { name: { contains: params.q, mode: 'insensitive' } },
          { email: { contains: params.q, mode: 'insensitive' } },
          // só busca por telefone se o texto parece telefone ("Voluntária 001" não pode casar pelos dígitos)
          ...(this.looksLikePhone(params.q) ? [{ phone: { contains: params.q.replace(/\D/g, '') } }] : []),
        ],
      }),
    };

    const [total, rows] = await Promise.all([
      this.prisma.participants.count({ where }),
      this.prisma.participants.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          sex: true,
          profile: true,
          profilePhoto: true,
          lastTrainingDate: true,
          congregation: { select: { id: true, name: true } },
          petitions: { select: { id: true, status: true } },
          participantsGroup: { select: { profile: true, group: { select: { id: true, name: true, type: true } } } },
        },
      }),
    ]);

    const items = rows.map(({ participantsGroup, ...p }) => ({
      ...p,
      groups: participantsGroup.map((pg) => ({ groupId: pg.group.id, name: pg.group.name, type: pg.group.type, role: pg.profile })),
    }));

    return { total, page, pageSize, items };
  }

  /**
   * Troca o perfil de sistema de alguém. Travas:
   * - não deixa o TPE sem nenhum coordenador;
   * - grava auditoria (quem promoveu/rebaixou quem).
   * O perfil no JWT só muda no próximo login da pessoa, mas o backend já vale na hora
   * (RolesGuard consulta o banco).
   */
  async updateProfile(id: string, { profile }: UpdateProfileDto, actor: JwtPayload) {
    const target = await this.prisma.participants.findUnique({ where: { id }, select: { id: true, name: true, profile: true } });
    if (!target) throw new NotFoundException('Participante não encontrado');
    if (target.profile === profile) throw new BadRequestException(`${target.name} já tem o perfil ${profile}`);

    if (target.profile === ParticipantProfile.COORDINATOR && profile !== ParticipantProfile.COORDINATOR) {
      const coordinators = await this.prisma.participants.count({ where: { profile: ParticipantProfile.COORDINATOR } });
      if (coordinators <= 1) {
        throw new ConflictException('O TPE precisa ter pelo menos um coordenador. Promova outra pessoa antes de rebaixar esta.');
      }
    }

    const updated = await this.prisma.participants.update({ where: { id }, data: { profile }, select: { id: true, name: true, profile: true } });
    await this.audit.log({
      actor,
      action: AuditAction.PROFILE_CHANGE,
      entity: 'participant',
      entityId: target.id,
      entityName: target.name,
      metadata: { from: target.profile, to: profile, via: 'coordenacao' },
    });
    return updated;
  }

  async updateTraining(id: string, { lastTrainingDate }: UpdateTrainingDto, actor: JwtPayload) {
    const target = await this.prisma.participants.findUnique({ where: { id }, select: { id: true, name: true, lastTrainingDate: true } });
    if (!target) throw new NotFoundException('Participante não encontrado');

    // meia-noite UTC, como o resto do sistema grava datas sem hora
    const next = lastTrainingDate ? new Date(`${lastTrainingDate}T00:00:00.000Z`) : null;
    if (next && Number.isNaN(next.getTime())) throw new BadRequestException('Data de treinamento inválida');
    if (next && next.getTime() > Date.now()) throw new BadRequestException('Data de treinamento não pode ser futura');

    const updated = await this.prisma.participants.update({ where: { id }, data: { lastTrainingDate: next }, select: { id: true, name: true, lastTrainingDate: true } });
    await this.audit.log({
      actor,
      action: AuditAction.TRAINING_CHANGE,
      entity: 'participant',
      entityId: target.id,
      entityName: target.name,
      metadata: { from: target.lastTrainingDate?.toISOString().slice(0, 10) ?? null, to: lastTrainingDate ?? null },
    });
    return updated;
  }
}
