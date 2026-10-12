/**
 * Teste de paridade do shape de designação: a saída do `toDesignationView` do
 * api-v2 tem que ser idêntica, campo a campo, à que a legacy produzia com
 * `DesignationMapper.toDomain(...).toJson()`.
 *
 * A implementação da legacy está COPIADA aqui abaixo, sem alteração, junto com a
 * `Designation` (só o essencial para o `toJson`, sem as regras de validação que
 * são da Fase 4). Se a legacy mudar, este arquivo precisa mudar junto — é o
 * alarme.
 *
 * Rodar: npx ts-node -T -r tsconfig-paths/register scripts/check-designation-view-parity.ts
 */
import { strict as assert } from 'node:assert';

import { toDesignationView, filterDesignationAssignments } from '../src/modules/designations/designation-view.mapper';

/* ------------------------------------------------------------------ *
 * 1:1 da legacy (api/src/domain/Designation.ts) — só o que o shape usa
 * ------------------------------------------------------------------ */

type LegacyParticipant = {
  id: string;
  name: string;
  cpf?: string | null;
  phone: string;
  profile_photo: string | null;
  sex: string;
  incident_history: { id: string; reason: string; status: string } | null;
  profile: string;
};

const FakeImage = (participant: { profile_photo: string | null; name: string }) => {
  if (!participant.profile_photo) {
    participant.profile_photo = `https://ui-avatars.com/api/?name=${participant.name}&background=2d3477&color=fff`;
  }
  return participant;
};

/** `DesignationMapper.toDomain` + `Designation.setup()` + `toJson()`, sem as regras. */
/**
 * `participantsCount` / `totalVacancies` da legacy são GETTERS avaliados no
 * `toJson()` — que roda depois de `filterAssignment()`. Por isso o total é
 * sempre sobre os pontos visíveis naquele momento.
 */
function legacyTotal(participants: any[], assignments: any[]) {
  return {
    participants: participants.length + assignments.reduce((acc: number, a: any) => acc + a.participants.length, 0),
    vacancies: assignments
      .filter((a: any) => a.point.status)
      .map((a: any) => a.config.max)
      .reduce((acc: number, max: number) => acc + max, 0),
  };
}

function legacyToJson(model: any) {
  const incidentMapper = (incident: any) => {
    if (incident.designationId !== model.id) return null;
    if (incident.status !== 'OPEN') return null;
    return { id: incident.id, reason: incident.reason, status: incident.status };
  };

  const participants: LegacyParticipant[] = model.group.ParticipantsGroup.map((pg: any) => {
    const [incidentHistory] = pg.participant.IncidentParticipant.map(incidentMapper).filter(Boolean);
    return {
      id: pg.participant.id,
      name: pg.participant.name,
      cpf: pg.participant.cpf,
      phone: pg.participant.phone,
      profile_photo: FakeImage(pg.participant).profile_photo,
      sex: pg.participant.sex,
      incident_history: incidentHistory || null,
      profile: pg.profile,
    };
  });

  const assignments = model.assignments.map((assignment: any) => ({
    id: assignment.id,
    point: { id: assignment.point.id, name: assignment.point.name, status: assignment.config_status },
    publication_carts: assignment.AssignmentsPublicationCart.map((c: any) => ({
      id: c.publicationCart.id,
      name: c.publicationCart.name,
    })),
    participants:
      assignment.AssignmentsParticipants.map((ap: any) => {
        const index = participants.findIndex((p) => p.id === ap.participant.id);
        if (index !== -1) participants.splice(index, 1);
        const [incidentHistory] = ap.participant.IncidentParticipant.map(incidentMapper).filter(Boolean);
        const groupProfile = ap.participant.ParticipantsGroup.find((pg: any) => pg.groupId === model.groupId)?.profile;
        return {
          id: ap.participant.id,
          name: ap.participant.name,
          cpf: ap.participant.cpf,
          phone: ap.participant.phone,
          profile_photo: FakeImage(ap.participant).profile_photo,
          sex: ap.participant.sex,
          incident_history: incidentHistory || null,
          profile: groupProfile,
        };
      }) || [],
    config: { max: assignment.config_max, min: assignment.config_min },
  }));

  // setup()
  const incidents: LegacyParticipant[] = [];
  const filterParticipantOff = (p: LegacyParticipant) => {
    if (p?.incident_history?.status === 'OPEN') {
      incidents.push(p);
      return false;
    }
    p.incident_history = null;
    return true;
  };
  const keptParticipants = participants.filter(filterParticipantOff);
  for (const assignment of assignments) {
    assignment.participants = assignment.participants.filter(filterParticipantOff);
  }

  // orderAssignment()
  assignments.sort((a: any, b: any) => a.point.name.localeCompare(b.point.name));
  assignments.forEach((a: any) => a.participants.sort((x: any, y: any) => x.name.localeCompare(y.name)));
  assignments.forEach((a: any) => a.publication_carts.sort((x: any, y: any) => x.name.localeCompare(y.name)));
  assignments.sort((a: any, b: any) => (a.point.status === b.point.status ? 0 : a.point.status ? -1 : 1));
  assignments.sort((a: any, b: any) => {
    if (a.participants.length === 0 && b.participants.length === 0) return 0;
    if (a.participants.length === 0) return 1;
    if (b.participants.length === 0) return -1;
    return 0;
  });

  // applyValidations() — `DesignationMapper.toDomain` roda os plugins DEPOIS do
  // setup() e antes do toJson(), então o `assignment.error` é parte da LEITURA.
  // Sem o `GenderRequirementRule` (dupla mista é permitida).
  for (const a of assignments) {
    if (a.participants.length === 1) {
      a.error = `O ponto ${a.point.name} não pode ter apenas um participante`;
    } else if (a.participants.length > a.config.max) {
      a.error = `O ponto ${a.point.name} não pode ter mais participantes do que o limite de ocupação`;
    } else {
      a.error = '';
    }
  }

  const json = {
    id: model.id,
    group: {
      id: model.group.id,
      name: model.group.name,
      whatsappId: model.group.whatsappId,
      type: model.group.type,
      config: {
        endHour: model.group.config_end_hour,
        startHour: model.group.config_start_hour,
        weekday: model.group.config_weekday,
        minParticipants: model.group.config_min,
        maxParticipants: model.group.config_max,
      },
    },
    status: model.status,
    assignments,
    participants: keptParticipants,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
    incidents,
    assignmentsFiltered: [],
    cancellationJustification: model.cancellationJustification || '',
    mandatoryPresence: model.mandatoryPresence,
    total: legacyTotal(keptParticipants, assignments),
  };

  // toJson(): JSON round-trip (Date -> ISO string) é o que o front recebe
  return JSON.parse(JSON.stringify(json));
}

/* ------------------------------------------------------------------ *
 * Fixture: mesmo dado nos dois formatos (snake_case da legacy, camelCase do api-v2)
 * ------------------------------------------------------------------ */

const G = 'g-1';
const D = 'd-1';

interface P {
  id: string;
  name: string;
  cpf?: string | null;
  photo?: string | null;
  sex?: 'MALE' | 'FEMALE';
  /** [designationId, status, reason] */
  incidents?: [string, string, string][];
  /** cargo por grupo */
  roles?: Record<string, string>;
}

function buildModel(people: P[], points: { name: string; status: boolean; max: number; min?: number; ids: string[]; carts?: string[] }[]) {
  const byId = new Map(people.map((p) => [p.id, p]));

  const incidentRows = (p: P) =>
    (p.incidents ?? []).map(([designationId, status, reason], i) => ({
      id: `${p.id}-inc-${i}`,
      participantId: p.id,
      designationId,
      reporterId: 'rep-1',
      reason,
      status,
      createdAt: new Date(`2026-01-0${i + 1}T12:00:00.000Z`),
      updatedAt: new Date(`2026-01-0${i + 1}T12:00:00.000Z`),
    }));

  const participantRows = (p: P) => ({
    id: p.id,
    name: p.name,
    cpf: p.cpf ?? null,
    phone: `11${p.id.replace(/\D/g, '').padStart(9, '0')}`,
    email: `${p.id}@tpe`,
    // as duas grafias de propósito: a legacy lê `profile_photo` (campo direto no
    // Prisma dela), o api-v2 lê `profilePhoto` (@map). São linhas separadas do banco,
    // então a mutação do FakeImage na legacy não contamina a outra cópia.
    profilePhoto: p.photo ?? null,
    profile_photo: p.photo ?? null,
    profile: 'PARTICIPANT',
    computed: null,
    sex: p.sex ?? 'MALE',
    attributions: [],
    availability: [],
    congregationId: null,
    birthDate: null,
    baptismDate: null,
    city: null,
    state: null,
    zipCode: null,
    hasMinorChild: null,
    languages: [],
    petitionId: null,
    spouseParticipant: null,
    civilStatus: null,
    lastTrainingDate: null,
  });

  const assignments = points.map((pt, i) => ({
    id: `a-${i}`,
    pointId: `pt-${i}`,
    config_min: pt.min ?? 0,
    config_max: pt.max,
    config_status: pt.status,
    designationsId: D,
    point: { id: `pt-${i}`, name: pt.name, locationPhoto: null },
    AssignmentsParticipants: pt.ids.map((id) => ({
      id: `ap-${i}-${id}`,
      assignmentId: `a-${i}`,
      participantId: id,
      participant: {
        ...participantRows(byId.get(id)!),
        IncidentParticipant: incidentRows(byId.get(id)!),
        ParticipantsGroup: Object.entries(byId.get(id)!.roles ?? {}).map(([groupId, profile]) => ({
          id: `${id}-${groupId}`,
          participantId: id,
          groupId,
          profile,
        })),
      },
    })),
    AssignmentsPublicationCart: (pt.carts ?? []).map((name, ci) => ({
      id: `apc-${i}-${ci}`,
      assignmentId: `a-${i}`,
      publicationCartId: `pc-${i}-${ci}`,
      publicationCart: { id: `pc-${i}-${ci}`, name, description: null, themePhoto: null },
    })),
  }));

  const legacy = {
    id: D,
    groupId: G,
    name: 'Designação',
    status: 'IN_PROGRESS',
    cancellationJustification: null,
    mandatoryPresence: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    designationDate: new Date('2026-01-01T00:00:00.000Z'),
    designationEndDate: new Date('2026-01-08T00:00:00.000Z'),
    group: {
      id: G,
      name: 'Grupo Centro',
      whatsappId: null,
      type: 'MAIN',
      config_weekday: 'WEDNESDAY',
      config_start_hour: '19:30',
      config_end_hour: '21:00',
      config_min: 2,
      config_max: 6,
      eventDayGroup: [],
      ParticipantsGroup: people.map((p) => ({
        id: `${p.id}-${G}`,
        participantId: p.id,
        groupId: G,
        profile: p.roles?.[G] ?? 'PARTICIPANT',
        participant: { ...participantRows(p), IncidentParticipant: incidentRows(p) },
      })),
    },
    assignments,
  };

  // mesmo dado no formato do api-v2 (Prisma mapeado com @map)
  const v2 = {
    id: D,
    groupId: G,
    name: 'Designação',
    status: 'IN_PROGRESS',
    cancellationJustification: null,
    mandatoryPresence: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    designationDate: new Date('2026-01-01T00:00:00.000Z'),
    designationEndDate: new Date('2026-01-08T00:00:00.000Z'),
    group: {
      id: G,
      name: 'Grupo Centro',
      whatsappId: null,
      type: 'MAIN',
      configWeekday: 'WEDNESDAY',
      configStartHour: '19:30',
      configEndHour: '21:00',
      configMin: 2,
      configMax: 6,
      eventDayGroup: [],
      participantsGroup: people.map((p) => ({
        id: `${p.id}-${G}`,
        participantId: p.id,
        groupId: G,
        profile: p.roles?.[G] ?? 'PARTICIPANT',
        participant: { ...participantRows(p), incidentParticipant: incidentRows(p) },
      })),
    },
    assignments: assignments.map((a) => ({
      id: a.id,
      pointId: a.pointId,
      config_min: a.config_min,
      config_max: a.config_max,
      config_status: a.config_status,
      designationsId: a.designationsId,
      point: a.point,
      assignmentsParticipants: a.AssignmentsParticipants.map((ap) => ({
        id: ap.id,
        assignmentId: ap.assignmentId,
        participantId: ap.participantId,
        participant: {
          ...ap.participant,
          incidentParticipant: ap.participant.IncidentParticipant,
          participantsGroup: ap.participant.ParticipantsGroup,
        },
      })),
      assignmentsPublicationCart: a.AssignmentsPublicationCart,
    })),
  };

  return { legacy, v2 };
}

/* ------------------------------------------------------------------ *
 * Casos
 * ------------------------------------------------------------------ */

const cases: { nome: string; people: P[]; points: any[] }[] = [
  {
    nome: 'ponto com 1 participante -> error de "apenas um"',
    people: [
      { id: 'p1', name: 'Ana Silva' },
      { id: 'p2', name: 'Bruno Souza' },
      { id: 'p3', name: 'Carla Rocha' },
    ],
    points: [
      { name: 'Sozinho', status: true, max: 3, ids: ['p1'], carts: [] },
      { name: 'Cheio', status: true, max: 2, ids: ['p2', 'p3'], carts: [] },
    ],
  },
  {
    nome: 'ponto acima do limite -> error de ocupação',
    people: [
      { id: 'p1', name: 'Ana Silva' },
      { id: 'p2', name: 'Bruno Souza' },
      { id: 'p3', name: 'Carla Rocha' },
    ],
    points: [{ name: 'Estourado', status: true, max: 2, ids: ['p1', 'p2', 'p3'], carts: [] }],
  },
  {
    nome: 'assignment válido recebe error "" (a chave existe na legacy)',
    people: [
      { id: 'p1', name: 'Ana Silva' },
      { id: 'p2', name: 'Bruno Souza' },
    ],
    points: [
      { name: 'Certo', status: true, max: 2, ids: ['p1', 'p2'], carts: [] },
      { name: 'Vazio', status: true, max: 2, ids: [], carts: [] },
    ],
  },
  {
    nome: 'ponto que zera depois de tirar falta com 1 pessoa -> sem erro',
    people: [
      { id: 'p1', name: 'Ana Silva' },
      { id: 'p2', name: 'Bruno Souza', incidents: [[D, 'OPEN', 'Doente']] },
    ],
    points: [{ name: 'Cheio', status: true, max: 2, ids: ['p1', 'p2'], carts: [] }],
  },
  {
    nome: 'baseline: 3 pontos, todos com gente',
    people: [
      { id: 'p1', name: 'Ana Silva' },
      { id: 'p2', name: 'Bruno Souza' },
      { id: 'p3', name: 'Carla Rocha', sex: 'FEMALE' },
      { id: 'p4', name: 'Diego Alves', roles: { [G]: 'CAPTAIN' } },
    ],
    points: [
      { name: 'Porta', status: true, max: 3, ids: ['p1', 'p2'], carts: ['Zuleica', 'Ademir'] },
      { name: 'Mesa', status: true, max: 4, ids: ['p3'], carts: ['Betânia'] },
      { name: 'Leitura', status: false, max: 2, ids: ['p4'], carts: [] },
    ],
  },
  {
    nome: 'falta ABERTA nesta designação some da lista e vai para incidents',
    people: [
      { id: 'p1', name: 'Ana Silva' },
      { id: 'p2', name: 'Bruno Souza', incidents: [[D, 'OPEN', 'Doente']] },
      { id: 'p3', name: 'Carla Rocha' },
    ],
    points: [
      { name: 'Porta', status: true, max: 3, ids: ['p1', 'p2'] },
      { name: 'Mesa', status: true, max: 4, ids: ['p3'] },
    ],
  },
  {
    nome: 'falta ABERTA em OUTRA designação não remove ninguém',
    people: [
      { id: 'p1', name: 'Ana Silva', incidents: [['outra', 'OPEN', 'Viajou']] },
      { id: 'p2', name: 'Bruno Souza' },
    ],
    points: [{ name: 'Porta', status: true, max: 3, ids: ['p1', 'p2'] }],
  },
  {
    nome: 'falta FECHADA não remove e zera incident_history',
    people: [
      { id: 'p1', name: 'Ana Silva', incidents: [[D, 'CLOSED', 'Doente']] },
      { id: 'p2', name: 'Bruno Souza' },
    ],
    points: [{ name: 'Porta', status: true, max: 3, ids: ['p1', 'p2'] }],
  },
  {
    nome: 'falta aberta de mais gente: escalado e não escalado',
    people: [
      { id: 'p1', name: 'Ana Silva' },
      { id: 'p2', name: 'Bruno Souza', incidents: [[D, 'OPEN', 'A']] },
      { id: 'p3', name: 'Carla Rocha', incidents: [[D, 'OPEN', 'B']] },
      { id: 'p4', name: 'Diego Alves', incidents: [[D, 'OPEN', 'C']] },
    ],
    points: [
      { name: 'Porta', status: true, max: 3, ids: ['p2', 'p3'] },
      { name: 'Mesa', status: true, max: 3, ids: [] },
    ],
  },
  {
    nome: 'ordem: ponto vazio por último, ponto ativo antes, nome como desempate',
    people: [
      { id: 'p1', name: 'Ana' },
      { id: 'p2', name: 'Bruno' },
      { id: 'p3', name: 'Carla' },
    ],
    points: [
      { name: 'Zeta', status: false, max: 2, ids: ['p1'] },
      { name: 'Alfa', status: false, max: 2, ids: [] },
      { name: 'Mesa', status: true, max: 2, ids: ['p2'] },
      { name: 'Porta', status: true, max: 2, ids: ['p3'] },
      { name: 'Brava', status: false, max: 2, ids: [] },
    ],
  },
  {
    nome: 'vagas: só ponto ativo conta no total',
    people: [{ id: 'p1', name: 'Ana' }],
    points: [
      { name: 'Porta', status: true, max: 3, ids: ['p1'] },
      { name: 'Mesa', status: false, max: 10, ids: [] },
      { name: 'Leitura', status: true, max: 4, ids: [] },
    ],
  },
  {
    nome: 'sem foto: cai no avatar do ui-avatars',
    people: [
      { id: 'p1', name: 'Ana Silva', photo: null },
      { id: 'p2', name: 'Bruno Souza', photo: 'https://cdn/x.png' },
    ],
    points: [{ name: 'Porta', status: true, max: 3, ids: ['p1', 'p2'] }],
  },
  {
    nome: 'foto só no escalated: avatar no grupo, url no ponto',
    people: [
      { id: 'p1', name: 'Ana Silva', photo: null },
      { id: 'p2', name: 'Bruno Souza' },
    ],
    points: [{ name: 'Porta', status: true, max: 3, ids: ['p2'] }],
  },
  {
    nome: 'sem pontos nenhum',
    people: [{ id: 'p1', name: 'Ana Silva' }],
    points: [],
  },
  {
    nome: 'cargo no grupo (não o perfil global) no escalated',
    people: [
      { id: 'p1', name: 'Ana', roles: { [G]: 'PARTICIPANT', 'outro-grupo': 'CAPTAIN' } },
      { id: 'p2', name: 'Bruno', roles: { [G]: 'ASSISTANT_CAPTAIN' } },
    ],
    points: [{ name: 'Porta', status: true, max: 3, ids: ['p1', 'p2'] }],
  },
  {
    nome: 'cancelada',
    people: [{ id: 'p1', name: 'Ana' }],
    points: [{ name: 'Porta', status: false, max: 3, ids: ['p1'] }],
  },
];

let ok = 0;
let fail = 0;

for (const c of cases) {
  const { legacy, v2 } = buildModel(c.people, c.points);
  const esperado = legacyToJson(structuredClone(legacy));
  const obtido = JSON.parse(JSON.stringify(toDesignationView(v2 as any)));
  try {
    assert.deepStrictEqual(obtido, esperado);
    ok++;
    console.log(`  ok   ${c.nome}`);
  } catch (e) {
    fail++;
    console.log(`  FALHA ${c.nome}`);
    console.log(
      (e as Error).message
        .split('\n')
        .slice(0, 40)
        .map((l) => `       ${l}`)
        .join('\n'),
    );
  }
}

/* ------------------------------------------------------------------ *
 * ?filter=
 * ------------------------------------------------------------------ */

{
  const { legacy, v2 } = buildModel(
    [
      { id: 'p1', name: 'Ana Silva' },
      { id: 'p2', name: 'Bruno Souza' },
      { id: 'p3', name: 'Carla Rocha' },
    ],
    [
      { name: 'Porta Alfa', status: true, max: 3, ids: ['p1'] },
      { name: 'Porta Beta', status: true, max: 3, ids: ['p2'] },
      { name: 'Mesa', status: true, max: 3, ids: ['p3'] },
    ],
  );
  const esperado = legacyToJson(structuredClone(legacy));
  // filtro legado, copiado de `Designation.filterAssignment`
  const reg = new RegExp('Porta', 'i');
  const filtered = esperado.assignments.filter((assignment: any) => {
    if (reg.test(assignment.point.name.toLowerCase())) {
      esperado.assignmentsFiltered.push(assignment);
      return false;
    }
    const participants = assignment.participants.filter((p: any) => reg.test(p.name.toLowerCase()));
    if (participants.length) {
      esperado.assignmentsFiltered.push({ ...assignment });
      return false;
    }
    return true;
  });
  esperado.assignments = filtered;
  // `total` é getter na legacy, avaliado no toJson() DEPOIS do filterAssignment:
  // o total é sempre sobre os pontos visíveis, não sobre a lista inteira.
  esperado.total = legacyTotal(esperado.participants, esperado.assignments);

  const obtido = JSON.parse(JSON.stringify(filterDesignationAssignments(toDesignationView(v2 as any), 'Porta')));
  try {
    assert.deepStrictEqual(obtido, esperado);
    ok++;
    console.log('  ok   ?filter= move os pontos para assignmentsFiltered e recalcula o total');
  } catch (e) {
    fail++;
    console.log('  FALHA ?filter=');
    console.log(
      (e as Error).message
        .split('\n')
        .slice(0, 30)
        .map((l) => `       ${l}`)
        .join('\n'),
    );
  }
}

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail === 0 ? 0 : 1);
