import { Prisma } from '@prisma/client';

import { profilePhotoOrAvatar } from 'src/shared/fake-image';
import { WEEKDAY_NUM } from 'src/shared/weekday.util';
import { DesignationView, DesignationViewAssignment, DesignationViewIncident, DesignationViewParticipant } from './designation-view.types';

/**
 * `include` único para as três leituras de designação (`week`, `week-details` e
 * `GET /designations/:id`). Espelha `DesignationRepository.findOne` da legacy.
 *
 * `participantsGroup` vem incluído também para os participantes que já estão
 * escalatedos — é de lá que sai o cargo no grupo deles.
 */
export const designationViewInclude = {
  group: {
    include: {
      eventDayGroup: { include: { eventDay: true } },
      participantsGroup: {
        include: {
          participant: {
            include: { incidentParticipant: { orderBy: { createdAt: 'desc' as const } } },
          },
        },
      },
    },
  },
  assignments: {
    include: {
      point: true,
      assignmentsParticipants: {
        include: {
          participant: {
            include: {
              incidentParticipant: { orderBy: { createdAt: 'desc' as const } },
              participantsGroup: true,
            },
          },
        },
      },
      assignmentsPublicationCart: { include: { publicationCart: true } },
    },
  },
} satisfies Prisma.DesignationsInclude;

export type DesignationModel = Prisma.DesignationsGetPayload<{
  include: typeof designationViewInclude;
}>;

/**
 * Falta ABERTA **desta** designação, no formato que o front consome.
 * A lista vem de todos os incidents do participante, então o filtro por designação
 * é obrigatório — sem ele, alguém com falta aberta na semana anterior apareceria
 * como "com falta" aqui também.
 */
function openIncident(incidentHistories: { id: string; designationId: string; reason: string; status: string }[], designationId: string): DesignationViewIncident | null {
  const incident = incidentHistories.find((i) => i.designationId === designationId && i.status === 'OPEN');
  return incident ? { id: incident.id, reason: incident.reason, status: incident.status } : null;
}

/**
 * Tira de `list` quem tem falta aberta e devolve em `removed`.
 * Quem fica tem `incident_history` zerado — é assim que a legacy entrega: o
 * `incident_history` só é não-nulo dentro de `incidents`.
 */
function separateIncidents(list: DesignationViewParticipant[]) {
  const kept: DesignationViewParticipant[] = [];
  const removed: DesignationViewParticipant[] = [];
  for (const participant of list) {
    if (participant.incident_history?.status === 'OPEN') {
      removed.push(participant);
    } else {
      kept.push({ ...participant, incident_history: null });
    }
  }
  return { kept, removed };
}

/**
 * Port de `ParticipantsNotAloneRule` + `OccupancyLimitRule` (sem o de gênero).
 *
 * Diferença de contrato que importa: a legacy escreve `error` em **todos** os
 * assignments — a mensagem quando a regra falha, e a string vazia `""` quando
 * passa. Ou seja, a chave sempre existe. Aqui é igual: `delete` (ou `undefined`)
 * mudaria o payload e quebraria qualquer `assignment.error ?? '...'` no front.
 *
 * A ordem das regras importa: `applyValidations` roda os plugins em sequência e
 * o throw de um impede os seguintes. Quem passa por último é quem define a
 * mensagem final.
 */
function applyOccupancyRules(assignments: DesignationViewAssignment[]): void {
  for (const assignment of assignments) {
    if (assignment.participants.length === 1) {
      assignment.error = `O ponto ${assignment.point.name} não pode ter apenas um participante`;
    } else if (assignment.participants.length > assignment.config.max) {
      assignment.error = `O ponto ${assignment.point.name} não pode ter mais participantes do que o limite de ocupação`;
    } else {
      assignment.error = '';
    }
  }
}

/**
 * Próxima ocorrência do dia da semana do grupo, na hora de encerramento.
 *
 * Os segundos e milissegundos ficam os de `today` (paridade com a legacy, que usa
 * `setHours`/`setMinutes` sem zerar o resto). Só importa no instante exato em que a
 * data vira — preservado de propósito para não mudar o que o voluntário vê.
 */
function nextDate(group: DesignationView['group'], today = new Date()): Date {
  const weekday = WEEKDAY_NUM[group.config.weekday];
  const date = new Date(today);
  date.setDate(today.getDate() + ((weekday + 7 - today.getDay()) % 7));
  const [hours, minutes] = group.config.endHour.split(':');
  date.setHours(Number(hours));
  date.setMinutes(Number(minutes));

  if (date < today) {
    date.setDate(date.getDate() + 7);
  }
  return date;
}

/**
 * Monta o shape que o front consome. Port 1:1 de `DesignationMapper.toDomain` +
 * `Designation.setup()` + `Designation.toJson()` da legacy.
 *
 * Ordem das operações importa e foi mantida:
 *  1. participantes do grupo viram a lista `participants`;
 *  2. ao mapear cada ponto, quem foi escalado sai dessa lista (`splice`);
 *  3. só então a falta aberta é separada (`incidents`);
 *  4. e a ordenação dos pontos é aplicada.
 */
export function toDesignationView(model: DesignationModel): DesignationView {
  const participants: DesignationViewParticipant[] = model.group.participantsGroup.map((participantGroup) => ({
    id: participantGroup.participant.id,
    name: participantGroup.participant.name,
    cpf: participantGroup.participant.cpf,
    phone: participantGroup.participant.phone,
    profile_photo: profilePhotoOrAvatar(participantGroup.participant),
    sex: participantGroup.participant.sex,
    incident_history: openIncident(participantGroup.participant.incidentParticipant, model.id),
    profile: participantGroup.profile,
  }));

  const assignments: DesignationViewAssignment[] = model.assignments.map((assignment) => ({
    id: assignment.id,
    point: {
      id: assignment.point.id,
      name: assignment.point.name,
      status: assignment.config_status,
    },
    publication_carts: assignment.assignmentsPublicationCart.map((cart) => ({
      id: cart.publicationCart.id,
      name: cart.publicationCart.name,
    })),
    participants: assignment.assignmentsParticipants.map(({ participant }) => {
      const index = participants.findIndex((p) => p.id === participant.id);
      if (index !== -1) participants.splice(index, 1);

      return {
        id: participant.id,
        name: participant.name,
        cpf: participant.cpf,
        phone: participant.phone,
        profile_photo: profilePhotoOrAvatar(participant),
        sex: participant.sex,
        incident_history: openIncident(participant.incidentParticipant, model.id),
        // cargo no grupo da designação, e não o perfil global.
        // Sem default: a legacy deixava `undefined` quando não achava a linha, e a
        // chave sumia do JSON. Default aqui mudaria o payload.
        profile: participant.participantsGroup.find((pg) => pg.groupId === model.groupId)?.profile,
      };
    }),
    config: {
      min: assignment.config_min,
      max: assignment.config_max,
    },
  }));

  // passo 3 — falta aberta sai das duas listas e vira `incidents`
  const incidents: DesignationViewParticipant[] = [];
  const unassigned = separateIncidents(participants);
  participants.splice(0, participants.length, ...unassigned.kept);
  incidents.push(...unassigned.removed);
  for (const assignment of assignments) {
    const separated = separateIncidents(assignment.participants);
    assignment.participants = separated.kept;
    incidents.push(...separated.removed);
  }

  // passo 3.5 — as regras de ocupação. Na legacy elas rodam em
  // `DesignationMapper.toDomain`, que chama `applyValidations()` DEPOIS do
  // `setup()` (ou seja, já sem quem tem falta aberta) e antes de `toJson()`.
  // Ou seja: o erro é parte da LEITURA, não só da escrita.
  //
  // Sem `GenderRequirementRule`: dupla homem+mulher passou a ser permitida
  // (decisão do usuário). Como nas rotas de escrita, quem decide é o front.
  applyOccupancyRules(assignments);

  // passo 4 — `orderAssignment` da legacy. A ordem dos sorts importa: `Array.sort` é
  // estável, então o último é a chave primária e o anterior vira desempate.
  assignments.sort((a, b) => a.point.name.localeCompare(b.point.name));
  assignments.forEach((a) => a.participants.sort((a, b) => a.name.localeCompare(b.name)));
  assignments.forEach((a) => a.publication_carts.sort((a, b) => a.name.localeCompare(b.name)));
  assignments.sort((a, b) => (a.point.status === b.point.status ? 0 : a.point.status ? -1 : 1));
  assignments.sort((a, b) => {
    if (a.participants.length === 0 && b.participants.length === 0) return 0;
    if (a.participants.length === 0) return 1;
    if (b.participants.length === 0) return -1;
    return 0;
  });

  const group: DesignationView['group'] = {
    id: model.group.id,
    name: model.group.name,
    whatsappId: model.group.whatsappId,
    type: model.group.type,
    config: {
      endHour: model.group.configEndHour,
      startHour: model.group.configStartHour,
      weekday: model.group.configWeekday,
      minParticipants: model.group.configMin,
      maxParticipants: model.group.configMax,
    },
  };

  return {
    id: model.id,
    group,
    status: model.status,
    assignments,
    participants,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
    incidents,
    assignmentsFiltered: [],
    cancellationJustification: model.cancellationJustification ?? '',
    mandatoryPresence: model.mandatoryPresence,
    total: computeTotal(participants, assignments),
  };
}

/**
 * `Designation.getNextDate`/`participantsCount`/`totalVacancies` da legacy,
 * materializados num objeto.
 *
 * Fica em função separada porque precisa ser RECALCULADO depois de um
 * `?filter`: na legacy, `total` são getters avaliados no `toJson()`, que roda
 * DEPOIS de `filterAssignment()` — então o total é sempre sobre os pontos
 * visíveis. Calcular uma vez só no mapper devolveria o total da lista inteira.
 */
export function computeTotal(participants: DesignationViewParticipant[], assignments: DesignationViewAssignment[]): DesignationView['total'] {
  return {
    participants: participants.length + assignments.reduce((acc, a) => acc + a.participants.length, 0),
    // vaga só conta em ponto ativo (`point.status`)
    vacancies: assignments.filter((a) => a.point.status).reduce((acc, a) => acc + a.config.max, 0),
  };
}

/**
 * `?filter=` da leitura da semana: esconde os pontos que não batem e guarda o que
 * casou em `assignmentsFiltered`.
 *
 * Paridade: a string chega como está (o front manda `encodeURIComponent(searchTerm)`)
 * e vira regex crua, sem decodificar — é assim que a legacy sempre se comportou.
 */
export function filterDesignationAssignments(view: DesignationView, filter: string): DesignationView {
  const reg = new RegExp(filter, 'i');
  view.assignmentsFiltered = [];
  view.assignments = view.assignments.filter((assignment) => {
    if (reg.test(assignment.point.name.toLowerCase())) {
      view.assignmentsFiltered.push(assignment);
      return false;
    }
    if (assignment.participants.some((p) => reg.test(p.name.toLowerCase()))) {
      view.assignmentsFiltered.push({ ...assignment });
      return false;
    }
    return true;
  });

  // `total` é getter na legacy, avaliado no `toJson()` — ou seja, DEPOIS do filtro.
  view.total = computeTotal(view.participants, view.assignments);
  return view;
}

export { nextDate };
