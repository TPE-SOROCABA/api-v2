import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { DesignationStatus, PetitionStatus } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { Participant } from '../participants/entities/participants.entity';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';

/** Quantas atualizações por pessoa a cada hora (o link é público, sem login). */
const MAX_UPDATES_PER_HOUR = 10;
const HOUR_MS = 3_600_000;

const FIELD_LABEL: Record<string, string> = {
  name: 'nome',
  email: 'e-mail',
  address: 'endereço',
  city: 'cidade',
  state: 'estado',
  zipCode: 'CEP',
  birthDate: 'data de nascimento',
  civilStatus: 'estado civil',
  availability: 'disponibilidade',
};

const maskPhone = (phone: string) => {
  const d = (phone || '').replace(/\D/g, '');
  return d.length >= 8 ? `${d.slice(0, 2)}${'*'.repeat(Math.max(d.length - 6, 3))}${d.slice(-4)}` : '';
};

const dateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * "Meus dados": a pessoa que abre o link individual da designação confere e atualiza o próprio cadastro.
 * O link é público (o voluntário comum não acessa o sistema), então: só quem está no grupo da designação,
 * só campos permitidos (sem telefone), e-mail único, limite de tentativas e auditoria de cada mudança.
 */
@Injectable()
export class ParticipantSelfService {
  private readonly attempts = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** A designação existe, ainda tem link ativo e a pessoa é do grupo dela. */
  private async load(designationId: string, participantId: string) {
    const designation = await this.prisma.designations.findUnique({ where: { id: designationId }, select: { id: true, status: true, groupId: true } });
    if (!designation) throw new NotFoundException('Designação não encontrada');
    // mesma regra da página da designação: o link só vale com a designação em andamento ou finalizada
    if (designation.status !== DesignationStatus.CLOSED && designation.status !== DesignationStatus.IN_PROGRESS) {
      throw new NotFoundException('Link não disponível');
    }
    const participant = await this.prisma.participants.findUnique({
      where: { id: participantId },
      include: { congregation: { select: { id: true, name: true, city: true } }, participantsGroup: { where: { groupId: designation.groupId }, select: { id: true } } },
    });
    if (!participant) throw new NotFoundException('Participante não encontrado');
    if (!participant.participantsGroup.length) throw new BadRequestException('Participante não está associado ao grupo');
    return participant;
  }

  async get(designationId: string, participantId: string) {
    const p = await this.load(designationId, participantId);
    const petition = p.petitionId ? await this.prisma.petitions.findUnique({ where: { id: p.petitionId }, select: { createdAt: true } }) : null;
    return {
      name: p.name,
      email: p.email,
      phoneMasked: maskPhone(p.phone), // telefone só aparece mascarado e não é editável aqui
      address: p.address,
      city: p.city,
      state: p.state,
      zipCode: p.zipCode,
      birthDate: dateOnly(p.birthDate),
      civilStatus: p.civilStatus,
      congregation: p.congregation ? `${p.congregation.name}${p.congregation.city ? ' - ' + p.congregation.city : ''}` : null,
      availability: (p.availability as unknown as { weekDay: number; morning: boolean; afternoon: boolean; evening: boolean }[]) ?? [],
      profileUpdatedAt: p.profileUpdatedAt,
      petitionCreatedAt: petition?.createdAt ?? null,
    };
  }

  private checkRate(participantId: string) {
    const now = Date.now();
    const recent = (this.attempts.get(participantId) ?? []).filter((t) => now - t < HOUR_MS);
    if (recent.length >= MAX_UPDATES_PER_HOUR) {
      throw new HttpException('Muitas alterações seguidas. Tente de novo mais tarde.', HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.attempts.set(participantId, recent);
  }

  async update(designationId: string, participantId: string, dto: UpdateOwnProfileDto) {
    const current = await this.load(designationId, participantId);
    this.checkRate(participantId);

    const data: Record<string, unknown> = {};
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const set = (field: string, to: unknown, from: unknown) => {
      if (JSON.stringify(to) === JSON.stringify(from)) return;
      data[field] = to;
      changes[field] = { from, to };
    };

    if (dto.name !== undefined) {
      if (dto.name.split(/\s+/).filter(Boolean).length < 2) throw new BadRequestException('Informe nome e sobrenome');
      set('name', dto.name, current.name);
    }
    if (dto.email !== undefined) {
      if (dto.email.toLowerCase() !== current.email.toLowerCase()) {
        const taken = await this.prisma.participants.findFirst({ where: { email: { equals: dto.email, mode: 'insensitive' }, id: { not: participantId } }, select: { id: true } });
        if (taken) throw new BadRequestException('Este e-mail já está cadastrado para outra pessoa. Confira se digitou certo.');
      }
      set('email', dto.email, current.email);
    }
    if (dto.address !== undefined) set('address', dto.address, current.address);
    if (dto.city !== undefined) set('city', dto.city, current.city);
    if (dto.state !== undefined) set('state', dto.state, current.state);
    if (dto.zipCode !== undefined) set('zipCode', dto.zipCode, current.zipCode);
    if (dto.civilStatus !== undefined) set('civilStatus', dto.civilStatus, current.civilStatus);
    if (dto.birthDate !== undefined) {
      if (dto.birthDate === null) {
        set('birthDate', null, dateOnly(current.birthDate));
      } else {
        const date = new Date(`${dto.birthDate}T00:00:00.000Z`);
        const now = new Date();
        if (Number.isNaN(date.getTime()) || date > now) throw new BadRequestException('Data de nascimento inválida');
        const age = now.getUTCFullYear() - date.getUTCFullYear() - (now.getTime() < Date.UTC(now.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) ? 1 : 0);
        if (age < 14 || age > 110) throw new BadRequestException('Data de nascimento inválida');
        set('birthDate', date, current.birthDate);
        changes.birthDate = { from: dateOnly(current.birthDate), to: dto.birthDate };
      }
    }
    if (dto.availability !== undefined) {
      const before = (current.availability as unknown as { weekDay: number; morning: boolean; afternoon: boolean; evening: boolean; updatedAt?: string }[]) ?? [];
      const stamp = new Date().toISOString();
      const next = dto.availability.map((a) => {
        const old = before.find((b) => b.weekDay === a.weekDay);
        const same = old && !!old.morning === a.morning && !!old.afternoon === a.afternoon && !!old.evening === a.evening;
        return { weekDay: a.weekDay, morning: a.morning, afternoon: a.afternoon, evening: a.evening, updatedAt: same ? (old!.updatedAt ?? stamp) : stamp };
      });
      const strip = (l: typeof next) => l.map(({ weekDay, morning, afternoon, evening }) => ({ weekDay, morning, afternoon, evening })).sort((x, y) => x.weekDay - y.weekDay);
      if (JSON.stringify(strip(next)) !== JSON.stringify(strip(before as typeof next))) {
        data.availability = next;
        changes.availability = { from: strip(before as typeof next), to: strip(next) };
      }
    }

    if (Object.keys(changes).length === 0) {
      // nada mudou: confirma como "atualizado" (a pessoa conferiu os dados) sem mexer em mais nada
      await this.prisma.participants.update({ where: { id: participantId }, data: { profileUpdatedAt: new Date() } });
      return { ...(await this.get(designationId, participantId)), changed: [] as string[] };
    }

    const entity = await this.prisma.participants.update({ where: { id: participantId }, data: { ...data, profileUpdatedAt: new Date() } });

    // mesma regra do cadastro feito pela coordenação: petição em aberto acompanha a completude dos dados
    if (entity.petitionId) {
      const built = Participant.build(entity as any);
      await this.prisma.petitions.updateMany({
        where: { id: entity.petitionId, status: { in: [PetitionStatus.CREATED, PetitionStatus.WAITING, PetitionStatus.WAITING_INFORMATION] } },
        data: { status: built.registrationStatus, name: built.name },
      });
    }

    await this.audit.log({
      actor: { id: participantId, name: entity.name },
      action: AuditAction.PARTICIPANT_SELF_UPDATE,
      entity: 'participant',
      entityId: participantId,
      entityName: entity.name,
      metadata: { via: 'link-da-designacao', designationId, changes: JSON.parse(JSON.stringify(changes)) },
    });

    return { ...(await this.get(designationId, participantId)), changed: Object.keys(changes).map((k) => FIELD_LABEL[k] ?? k) };
  }
}
