import { Injectable } from '@nestjs/common';
import { DesignationStatus, GroupStatus, GroupType, ParticipantGroupProfile, ParticipantProfile, ParticipantSex, PetitionStatus } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { WaitlistService } from '../waitlist/waitlist.service';

// petição em "aguardando informação" há mais que isso conta como esquecida
const STALLED_PETITION_DAYS = 30;
const RECENT_INCIDENTS_DAYS = 30;
const ALERT_ITEMS_LIMIT = 8;
const STAFF_PROFILES: ParticipantProfile[] = [ParticipantProfile.COORDINATOR, ParticipantProfile.ASSISTANT_COORDINATOR, ParticipantProfile.ADMIN_ANALYST];

export type AlertLevel = 'high' | 'medium' | 'info';

export interface OverviewAlert {
  key: string;
  level: AlertLevel;
  title: string;
  description: string;
  count: number;
  /** tela do admin que resolve o alerta */
  href: string;
  /** até ALERT_ITEMS_LIMIT nomes, só pra dar contexto */
  items: string[];
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

/** `Nome (detalhe)` limitado, com "+N" quando a lista foi cortada. */
function sample(labels: string[]): string[] {
  if (labels.length <= ALERT_ITEMS_LIMIT) return labels;
  return [...labels.slice(0, ALERT_ITEMS_LIMIT), `+${labels.length - ALERT_ITEMS_LIMIT} outros`];
}

@Injectable()
export class CoordinationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly waitlistService: WaitlistService,
  ) {}

  /**
   * Visão do TPE inteiro para o coordenador: números gerais + alertas acionáveis.
   * Só leitura. Reaproveita a Lista de Espera pra manter uma única regra de "quem é colocável".
   */
  async getOverview() {
    const [participants, groups, openDesignationGroups, waitlist, incidentsTotal, incidentsRecent] = await Promise.all([
      this.prisma.participants.findMany({
        select: {
          id: true,
          name: true,
          sex: true,
          profile: true,
          lastTrainingDate: true,
          congregationId: true,
          availability: true,
          petitions: { select: { status: true, updatedAt: true } },
          participantsGroup: { select: { groupId: true } },
        },
      }),
      this.prisma.groups.findMany({
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          configMax: true,
          participantsGroup: { select: { profile: true, participantId: true } },
        },
      }),
      this.prisma.designations.groupBy({
        by: ['groupId'],
        where: { status: { in: [DesignationStatus.OPEN, DesignationStatus.IN_PROGRESS] } },
      }),
      this.waitlistService.getWaitlist({}),
      // faltas: mesma regra do Painel de Faltas (semana com presença opcional não conta)
      this.prisma.incidentHistories.count({ where: { designation: { mandatoryPresence: true } } }),
      this.prisma.incidentHistories.count({
        where: { designation: { mandatoryPresence: true, designationDate: { gte: daysAgo(RECENT_INCIDENTS_DAYS) } } },
      }),
    ]);

    // ---- voluntários --------------------------------------------------------------------
    const bySex = { MALE: 0, FEMALE: 0 };
    const activeBySex = { MALE: 0, FEMALE: 0 };
    const byPetition: Record<string, number> = { NONE: 0 };
    for (const s of Object.values(PetitionStatus)) byPetition[s] = 0;

    let withTraining = 0;
    let activeWithTraining = 0;
    let activeTotal = 0;
    const stalledBefore = daysAgo(STALLED_PETITION_DAYS);
    const activeWithoutGroup: string[] = [];
    const stalledPetitions: string[] = [];
    const activeWithoutTraining: string[] = [];
    let noAvailability = 0;
    let noCongregation = 0;

    for (const p of participants) {
      const status = p.petitions?.status ?? 'NONE';
      byPetition[status] = (byPetition[status] ?? 0) + 1;
      bySex[p.sex]++;
      if (p.lastTrainingDate) withTraining++;

      const isStaff = !!p.profile && STAFF_PROFILES.includes(p.profile);
      if (status === PetitionStatus.ACTIVE) {
        activeTotal++;
        activeBySex[p.sex]++;
        if (p.lastTrainingDate) activeWithTraining++;
        else activeWithoutTraining.push(p.name);
        if (!isStaff && p.participantsGroup.length === 0) activeWithoutGroup.push(p.name);
      }
      if (status === PetitionStatus.WAITING_INFORMATION && p.petitions && p.petitions.updatedAt < stalledBefore) {
        stalledPetitions.push(p.name);
      }
      // dado incompleto que trava a Lista de Espera / a designação
      if (status === PetitionStatus.ACTIVE || status === PetitionStatus.WAITING || status === PetitionStatus.WAITING_INFORMATION) {
        if (!p.availability || p.availability.length === 0) noAvailability++;
        if (p.congregationId == null) noCongregation++;
      }
    }

    // ---- cargos ---------------------------------------------------------------------------
    const captainIds = new Set<string>();
    const assistantCaptainIds = new Set<string>();
    for (const g of groups) {
      for (const pg of g.participantsGroup) {
        if (pg.profile === ParticipantGroupProfile.CAPTAIN) captainIds.add(pg.participantId);
        if (pg.profile === ParticipantGroupProfile.ASSISTANT_CAPTAIN) assistantCaptainIds.add(pg.participantId);
      }
    }
    const countProfile = (profile: ParticipantProfile) => participants.filter((p) => p.profile === profile).length;

    // ---- grupos ---------------------------------------------------------------------------
    const emptyType = () => ({ groups: 0, capacity: 0, members: 0, vacancies: 0 });
    const byType: Record<GroupType, ReturnType<typeof emptyType>> = {
      [GroupType.MAIN]: emptyType(),
      [GroupType.ADDITIONAL]: emptyType(),
      [GroupType.SPECIAL]: emptyType(),
    };
    const withOpenDesignation = new Set(openDesignationGroups.map((d) => d.groupId));
    const withoutCaptain: string[] = [];
    const withoutAssistant: string[] = [];
    const withVacancies: { label: string; vacancies: number }[] = [];
    const withoutDesignation: string[] = [];
    let openGroups = 0;

    for (const g of groups) {
      const members = g.participantsGroup.length;
      const vacancies = Math.max(g.configMax - members, 0);
      const t = byType[g.type];
      t.groups++;
      t.capacity += g.configMax;
      t.members += members;
      t.vacancies += vacancies;

      if (g.status !== GroupStatus.OPEN) continue;
      openGroups++;
      if (g.type === GroupType.SPECIAL) continue;

      if (!g.participantsGroup.some((pg) => pg.profile === ParticipantGroupProfile.CAPTAIN)) withoutCaptain.push(g.name);
      if (!g.participantsGroup.some((pg) => pg.profile === ParticipantGroupProfile.ASSISTANT_CAPTAIN)) withoutAssistant.push(g.name);
      if (vacancies > 0) withVacancies.push({ label: `${g.name} — ${vacancies} ${vacancies === 1 ? 'vaga' : 'vagas'}`, vacancies });
      if (!withOpenDesignation.has(g.id)) withoutDesignation.push(g.name);
    }
    withVacancies.sort((a, b) => b.vacancies - a.vacancies);

    // ---- lista de espera (mesma regra da tela Lista de Espera) -----------------------
    const inMain = new Set<string>();
    const inAdditional = new Set<string>();
    let oldestWaitingSince: Date | null = null;
    for (const g of waitlist.groups) {
      for (const c of g.candidates) {
        (g.type === GroupType.MAIN ? inMain : inAdditional).add(c.participantId);
        if (!oldestWaitingSince || c.waitingSince < oldestWaitingSince) oldestWaitingSince = c.waitingSince;
      }
    }

    // ---- alertas (só os que têm algo a resolver) ---------------------------------------
    const alerts: OverviewAlert[] = [
      {
        key: 'groups-without-captain',
        level: 'high' as AlertLevel,
        title: 'Grupos sem capitão',
        description: 'Grupo aberto sem ninguém no cargo de capitão.',
        count: withoutCaptain.length,
        href: '/grupos',
        items: sample(withoutCaptain),
      },
      {
        key: 'active-without-group',
        level: 'high' as AlertLevel,
        title: 'Voluntários ativos sem grupo',
        description: 'Petição ativa, mas a pessoa não está em nenhum grupo.',
        count: activeWithoutGroup.length,
        href: '/peticoes',
        items: sample(activeWithoutGroup),
      },
      {
        key: 'groups-with-vacancies',
        level: 'medium' as AlertLevel,
        title: 'Grupos com vagas',
        description: 'Abaixo do máximo de participantes — veja a Lista de Espera.',
        count: withVacancies.length,
        href: '/lista-espera',
        items: sample(withVacancies.map((v) => v.label)),
      },
      {
        key: 'groups-without-assistant',
        level: 'medium' as AlertLevel,
        title: 'Grupos sem assistente de capitão',
        description: 'Grupo aberto sem capitão assistente.',
        count: withoutAssistant.length,
        href: '/grupos',
        items: sample(withoutAssistant),
      },
      {
        key: 'stalled-petitions',
        level: 'medium' as AlertLevel,
        title: 'Petições paradas',
        description: `Aguardando informação há mais de ${STALLED_PETITION_DAYS} dias.`,
        count: stalledPetitions.length,
        href: '/peticoes',
        items: sample(stalledPetitions),
      },
      {
        key: 'groups-without-designation',
        level: 'info' as AlertLevel,
        title: 'Grupos sem designação aberta',
        description: 'Nenhuma designação aberta ou em andamento no momento.',
        count: withoutDesignation.length,
        href: '/lista-designacao',
        items: sample(withoutDesignation),
      },
      {
        key: 'active-without-training',
        level: 'info' as AlertLevel,
        title: 'Ativos sem treinamento',
        description: 'Voluntários ativos sem nenhuma data de treinamento registrada.',
        count: activeWithoutTraining.length,
        href: '/grupos',
        items: sample(activeWithoutTraining),
      },
    ].filter((a) => a.count > 0);

    return {
      generatedAt: new Date().toISOString(),
      volunteers: {
        total: participants.length,
        bySex,
        active: { total: activeTotal, bySex: activeBySex },
        byPetition,
        training: {
          withTraining,
          withoutTraining: participants.length - withTraining,
          activeWithTraining,
          activeWithoutTraining: activeTotal - activeWithTraining,
        },
        incomplete: { noAvailability, noCongregation },
      },
      roles: {
        coordinators: countProfile(ParticipantProfile.COORDINATOR),
        assistantCoordinators: countProfile(ParticipantProfile.ASSISTANT_COORDINATOR),
        adminAnalysts: countProfile(ParticipantProfile.ADMIN_ANALYST),
        captains: captainIds.size,
        assistantCaptains: assistantCaptainIds.size,
      },
      groups: {
        total: groups.length,
        open: openGroups,
        closed: groups.length - openGroups,
        byType,
      },
      waitlist: {
        total: waitlist.summary.waitlistTotal,
        bySex: waitlist.summary.bySex,
        inMainGroups: inMain.size,
        inAdditionalGroups: inAdditional.size,
        groupsWithVacancies: waitlist.summary.groupsNeedingHelp,
        oldestWaitingSince,
      },
      incidents: { total: incidentsTotal, last30Days: incidentsRecent },
      alerts,
    };
  }
}
