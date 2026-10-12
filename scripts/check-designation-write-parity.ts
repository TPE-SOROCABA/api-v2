/**
 * Paridade da ESCRITA de designação: roda o `DesignationWriteService` real contra
 * a implementação da legacy COPIADA aqui (`DesignationState.updateParticipants` +
 * `ParticipantsNotAloneRule` + `OccupancyLimitRule`), e compara os resultados.
 *
 * O serviço real é exercitado com um Prisma falso que só registra as operações —
 * assim o que entra na comparação é o que o serviço DE FARIA no banco, não uma
 * reimplementação dele.
 *
 * Roda com:
 *   npx ts-node -T -r tsconfig-paths/register scripts/check-designation-write-parity.ts
 */
import { DesignationStatus } from '@prisma/client';

import { DesignationWriteService } from 'src/modules/designations/designation-write.service';
import { toDesignationView } from 'src/modules/designations/designation-view.mapper';

// ----------------------------------------------------------------------------------------
// legacy copiada — NÃO editar para "melhorar", é a referência
// ----------------------------------------------------------------------------------------

interface LegacyParticipant {
  id: string;
  incident: { status: string } | null;
}
interface LegacyAssignment {
  id: string;
  pointName: string;
  config: { min: number; max: number };
  participants: LegacyParticipant[];
  error?: string;
}
interface LegacyDesignation {
  assignments: LegacyAssignment[];
  participants: LegacyParticipant[];
}

/** `Designation.setup()`: falta ABERTA sai das duas listas. */
function legacySetup(pool: LegacyParticipant[], assignments: LegacyAssignment[]) {
  for (const assignment of assignments) {
    assignment.participants = assignment.participants.filter((p) => p.incident?.status !== 'OPEN');
  }
  const kept: LegacyParticipant[] = [];
  const removed: LegacyParticipant[] = [];
  for (const p of pool) {
    if (p.incident?.status === 'OPEN') removed.push(p);
    else kept.push(p);
  }
  return { kept, removed };
}

/** `DesignationState.updateParticipants` — literal. */
function legacyUpdateParticipants(designation: LegacyDesignation, pointId: string, participantsIds: string[]): boolean {
  const assignment = designation.assignments.find((a) => a.pointName === pointId);
  if (!assignment) throw new Error('Ponto não encontrado');
  try {
    const participantsRemoved = assignment.participants.filter((p) => !participantsIds.includes(p.id));
    designation.participants.push(...participantsRemoved);

    for (const a of designation.assignments) {
      const participants = a.participants.filter((p) => participantsIds.includes(p.id));
      designation.participants.push(...participants);
      a.participants = a.participants.filter((p) => !participantsIds.includes(p.id));
    }

    const participants = designation.participants.filter((p) => participantsIds.includes(p.id));
    assignment.participants = participants;
    designation.participants = designation.participants.filter((p) => !participantsIds.includes(p.id));
    return true;
  } catch {
    return false;
  }
}

/** `ParticipantsNotAloneRule` + `OccupancyLimitRule` — sem o de gênero (não portado). */
function legacyValidationErrors(d: LegacyDesignation) {
  for (const assignment of d.assignments) {
    if (assignment.participants.length === 1) {
      assignment.error = `O ponto ${assignment.pointName} não pode ter apenas um participante`;
    } else if (assignment.participants.length > assignment.config.max) {
      assignment.error = `O ponto ${assignment.pointName} não pode ter mais participantes do que o limite de ocupação`;
    } else {
      delete assignment.error;
    }
  }
}

// ----------------------------------------------------------------------------------------
// fixture
// ----------------------------------------------------------------------------------------

const ID = { A: '11111111-1111-4111-8111-111111111111', B: '22222222-2222-4222-8222-222222222222' };
const P = (n: number) => `p${n}`;

type Incident = { designationId: string; status: string };

function buildModel(opts: {
  /** [id, tem falta aberta nesta designação?] para membros do grupo */
  members: [string, boolean][];
  /** assignmentId -> { pointId, participantes } */
  assignments: { id: string; pointId: string; participants: [string, boolean][] }[];
  max?: number;
  /** ids com falta ABERTA em OUTRA designação — não devem bloquear nada aqui */
  openElsewhere?: string[];
}) {
  const all = [
    ...opts.members.map(([id]) => ({ id, incidentParticipant: incidentOf(id) })),
    ...opts.assignments.flatMap((a) => a.participants.map(([id]) => ({ id, incidentParticipant: incidentOf(id) }))),
  ];
  return {
    id: ID.A,
    groupId: ID.B,
    status: DesignationStatus.OPEN,
    mandatoryPresence: true,
    cancellationJustification: '',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    group: {
      id: ID.B,
      name: 'Grupo Teste',
      whatsappId: null,
      type: 'MAIN',
      configWeekday: 'MONDAY',
      configStartHour: '19:00',
      configEndHour: '21:00',
      configMin: 2,
      configMax: 4,
      participantsGroup: opts.members.map(([id]) => ({
        participantId: id,
        groupId: ID.B,
        profile: 'PARTICIPANT',
        participant: { id, name: id, cpf: null, phone: '000', profilePhoto: null, sex: 'MALE', incidentParticipant: incidentOf(id) },
      })),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __incidentOf: incidentOf,
    assignments: opts.assignments.map((a) => ({
      id: a.id,
      pointId: a.pointId,
      designationsId: ID.A,
      config_min: 2,
      config_max: opts.max ?? 4,
      config_status: true,
      point: { id: a.pointId, name: `Ponto ${a.pointId}` },
      assignmentsPublicationCart: [],
      // cargo fixo: neste script a 2a posição da tupla é "tem falta aberta",
      // não o cargo. O cargo em si é coberto pelo check-designation-view-parity.
      assignmentsParticipants: a.participants.map(([id]) => ({
        participantId: id,
        assignmentId: a.id,
        participant: {
          id,
          name: id,
          cpf: null,
          phone: '000',
          profilePhoto: null,
          sex: 'MALE',
          incidentParticipant: incidentOf(id),
          // o include real traz `participantsGroup: true`, então quem está
          // escalado SEMPRE chega com a linha do cargo. Fixture com [] aqui
          // esconderia bugs de paridade.
          participantsGroup: [{ id: 'pg-' + id, groupId: ID.B, participantId: id, profile: 'PARTICIPANT' }],
        },
      })),
    })),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...{ _all: all },
  };

  function incidentOf(id: string): Incident[] {
    if ((opts.openElsewhere ?? []).includes(id)) {
      return [{ designationId: 'outra-designacao', status: 'OPEN' }];
    }
    const blocked = opts.members.some(([m, open]) => m === id && open) || opts.assignments.some((a) => a.participants.some(([m, open]) => m === id && open));
    return blocked ? [{ designationId: ID.A, status: 'OPEN' }] : [];
  }
}

/** mesmo fixture, no formato do domínio da legacy (já com `setup()` aplicado) */
function buildLegacyDomain(model: ReturnType<typeof buildModel>): LegacyDesignation {
  const assigned = new Map((model.assignments as any[]).map((a) => [a.id, a]));
  const byParticipant = new Map<string, { status: string } | null>();
  // `incidentMapper` só considera falta de ESTA designação — por isso o
  // filtro por `designationId`, senão uma falta da semana anterior bloquearia
  // alguém aqui e o simulado divergiria do comportamento real da legacy.
  const hasOpenHere = (inc: Incident[]) => inc.some((i) => i.designationId === ID.A && i.status === 'OPEN');
  for (const pg of (model.group as any).participantsGroup) {
    const inc = (pg.participant?.incidentParticipant ?? []) as Incident[];
    byParticipant.set(pg.participantId, hasOpenHere(inc) ? { status: 'OPEN' } : null);
  }
  for (const a of model.assignments as any[]) {
    for (const ap of a.assignmentsParticipants) {
      if (!byParticipant.has(ap.participantId)) byParticipant.set(ap.participantId, null);
    }
  }

  const designation: LegacyDesignation = {
    participants: (model.group as any).participantsGroup.map((pg: any) => ({
      id: pg.participantId,
      incident: byParticipant.get(pg.participantId) ?? null,
    })),
    assignments: (model.assignments as any[]).map((a) => ({
      id: a.id,
      pointName: `Ponto ${a.pointId}`,
      config: { min: a.config_min, max: a.config_max },
      participants: a.assignmentsParticipants.map((ap: any) => ({
        id: ap.participantId,
        incident: byParticipant.get(ap.participantId) ?? null,
      })),
    })),
  };
  void assigned;

  // setup(): quem está escalado sai da lista de disponíveis
  const scaled = new Set(designation.assignments.flatMap((a) => a.participants.map((p) => p.id)));
  designation.participants = designation.participants.filter((p) => !scaled.has(p.id));
  const { kept } = legacySetup(designation.participants, designation.assignments);
  designation.participants = kept;
  return designation;
}

// ----------------------------------------------------------------------------------------
// harness
// ----------------------------------------------------------------------------------------

type Op = { name: string; args: any };

function makeHarness(model: any) {
  const ops: Op[] = [];
  const prisma: any = {
    assignmentsParticipants: {
      deleteMany: (args: any) => (ops.push({ name: 'ap.deleteMany', args }), Promise.resolve({ count: 0 })),
      createMany: (args: any) => (ops.push({ name: 'ap.createMany', args }), Promise.resolve({ count: 0 })),
    },
    assignments: {
      update: (args: any) => (ops.push({ name: 'assignments.update', args }), Promise.resolve({})),
    },
    designations: {
      update: (args: any) => (ops.push({ name: 'designations.update', args }), Promise.resolve({})),
      findUnique: () => Promise.resolve(model),
    },
    $transaction: (arg: any) => {
      ops.push({ name: '$transaction', args: [] });
      if (Array.isArray(arg)) arg.forEach((p: any) => p);
      return Promise.resolve([]);
    },
    groups: {
      findFirst: () => Promise.resolve(null),
    },
    pointPublicationCart: { findMany: () => Promise.resolve([]) },
  };

  const service = new DesignationWriteService(
    prisma,
    { dispatch: async () => undefined } as any,
    { generate: () => 'msg' } as any,
    { shorten: async (url: string) => `https://go.tpedigital.com.br/s/${url.length % 10}` } as any,
    { previousArchivedDesignation: async () => null } as any,
  );

  (service as any).load = async () => model;

  // Read simulado: aplica ao fixture as operações registradas, ou seja, o que o
  // banco devolveria depois da gravação. Serve para provar que a resposta montada
  // em memória (o que o serviço faz hoje) é IDÊNTICA a um re-read — é o que
  // garante que economizar a segunda consulta não muda o payload.
  const buildReloaded = () => {
    const copy: any = JSON.parse(JSON.stringify(model));
    const incidentOf = (model as any).__incidentOf;
    for (const pg of copy.group.participantsGroup) pg.participant.incidentParticipant = incidentOf(pg.participantId);

    for (const d of ops.filter((o) => o.name === 'ap.deleteMany')) {
      const w = d.args.where ?? {};
      for (const a of copy.assignments) {
        a.assignmentsParticipants = a.assignmentsParticipants.filter((ap: any) => {
          if (w.assignmentId && ap.assignmentId !== w.assignmentId) return true;
          if (w.participantId?.in && !w.participantId.in.includes(ap.participantId)) return true;
          return false;
        });
      }
    }

    for (const c of createdIn(ops)) {
      const a = copy.assignments.find((x: any) => x.id === c.assignmentId);
      if (a && !a.assignmentsParticipants.some((ap: any) => ap.participantId === c.participantId)) {
        const row = model.group.participantsGroup.find((pg: any) => pg.participantId === c.participantId);
        a.assignmentsParticipants.push({
          participantId: c.participantId,
          assignmentId: c.assignmentId,
          participant: row
            ? { ...row.participant, participantsGroup: [{ groupId: model.groupId, profile: row.profile }] }
            : {
                id: c.participantId,
                name: c.participantId,
                cpf: null,
                phone: '000',
                profilePhoto: null,
                sex: 'MALE',
                incidentParticipant: incidentOf(c.participantId),
                participantsGroup: [{ id: 'pg-' + c.participantId, groupId: model.groupId, participantId: c.participantId, profile: 'PARTICIPANT' }],
              },
        });
      }
    }
    return copy;
  };

  (service as any).view = async () => toDesignationView(buildReloaded() as any);

  return { service, ops, buildReloaded };
}

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function idsOf(ops: Op[], assignmentId: string): string[] {
  const create = ops.find((o) => o.name === 'ap.createMany');
  const data: { assignmentId: string; participantId: string }[] = create?.args?.data ?? [];
  return data
    .filter((r) => r.assignmentId === assignmentId)
    .map((r) => r.participantId)
    .sort();
}

function createdIn(ops: Op[]): { assignmentId: string; participantId: string }[] {
  const create = ops.find((o) => o.name === 'ap.createMany');
  return create?.args?.data ?? [];
}

// ----------------------------------------------------------------------------------------
// casos
// ----------------------------------------------------------------------------------------

console.log('\nupdateParticipants — paridade com DesignationState.updateParticipants\n');

/** todos os casos rodam depois, dentro de `main()`, porque o serviço é async */
const casesResult: (() => Promise<void>)[] = [];

const cases: {
  name: string;
  model: ReturnType<typeof buildModel>;
  target: string;
  send: string[];
}[] = [
  {
    name: 'escalador novo a partir dos disponíveis',
    model: buildModel({
      members: [
        [P(1), false],
        [P(2), false],
        [P(3), false],
      ],
      assignments: [{ id: 'a1', pointId: 'pt1', participants: [] }],
    }),
    target: 'pt1',
    send: [P(1), P(2)],
  },
  {
    name: 'troca alguém de ponto (sai de pt1, entra em pt2)',
    model: buildModel({
      members: [
        [P(1), false],
        [P(2), false],
        [P(3), false],
      ],
      assignments: [
        { id: 'a1', pointId: 'pt1', participants: [[P(1), false]] },
        { id: 'a2', pointId: 'pt2', participants: [] },
      ],
    }),
    target: 'pt2',
    send: [P(1)],
  },
  {
    name: 'esvazia o ponto',
    model: buildModel({ members: [[P(1), false]], assignments: [{ id: 'a1', pointId: 'pt1', participants: [[P(1), false]] }] }),
    target: 'pt1',
    send: [],
  },
  {
    name: 'reordena dentro do mesmo ponto (mantém o mesmo conjunto)',
    model: buildModel({
      members: [
        [P(1), false],
        [P(2), false],
      ],
      assignments: [
        {
          id: 'a1',
          pointId: 'pt1',
          participants: [
            [P(1), false],
            [P(2), false],
          ],
        },
      ],
    }),
    target: 'pt1',
    send: [P(2), P(1)],
  },
  {
    name: 'ignora quem tem falta ABERTA nesta designação',
    model: buildModel({
      members: [
        [P(1), false],
        [P(2), true],
        [P(3), false],
      ],
      assignments: [{ id: 'a1', pointId: 'pt1', participants: [] }],
    }),
    target: 'pt1',
    send: [P(1), P(2)],
  },
  {
    name: 'ignora falta de OUTRA designação',
    model: buildModel({
      members: [
        [P(1), false],
        [P(2), false],
      ],
      assignments: [{ id: 'a1', pointId: 'pt1', participants: [] }],
      openElsewhere: [P(2)],
    }),
    target: 'pt1',
    send: [P(1), P(2)],
  },
  {
    name: 'id que não existe é simplesmente ignorado',
    model: buildModel({ members: [[P(1), false]], assignments: [{ id: 'a1', pointId: 'pt1', participants: [] }] }),
    target: 'pt1',
    send: [P(1), P(99)],
  },
  {
    name: 'limpa dos outros pontos quem foi movido',
    model: buildModel({
      members: [
        [P(1), false],
        [P(2), false],
      ],
      assignments: [
        {
          id: 'a1',
          pointId: 'pt1',
          participants: [
            [P(1), false],
            [P(2), false],
          ],
        },
        { id: 'a2', pointId: 'pt2', participants: [] },
      ],
    }),
    target: 'pt2',
    send: [P(1), P(2)],
  },
  {
    name: 'quem não foi pedido continua no ponto de origem',
    model: buildModel({
      members: [
        [P(1), false],
        [P(2), false],
      ],
      assignments: [
        {
          id: 'a1',
          pointId: 'pt1',
          participants: [
            [P(1), false],
            [P(2), false],
          ],
        },
        { id: 'a2', pointId: 'pt2', participants: [] },
      ],
    }),
    target: 'pt2',
    send: [P(1)],
  },
  {
    name: 'duplicados no payload não duplicam linha',
    model: buildModel({ members: [[P(1), false]], assignments: [{ id: 'a1', pointId: 'pt1', participants: [] }] }),
    target: 'pt1',
    send: [P(1), P(1), P(1)],
  },
];

for (const c of cases) {
  const domain = buildLegacyDomain(c.model);
  const assignmentId = (c.model.assignments.find((a) => a.pointId === c.target) as any).id;
  legacyUpdateParticipants(domain, `Ponto ${c.target}`, c.send);
  legacyValidationErrors(domain);
  const expected = domain.assignments
    .find((a) => a.pointName === `Ponto ${c.target}`)!
    .participants.map((p) => p.id)
    .sort();

  casesResult.push(async () => {
    const { service, ops, buildReloaded } = makeHarness(c.model);
    const resposta = await service.updateParticipants(ID.A, c.target, { participants: c.send }).catch(() => undefined);
    const got = idsOf(ops, assignmentId);
    check(c.name, eq(got, expected), `legacy=${JSON.stringify(expected)} api-v2=${JSON.stringify(got)}`);

    // a resposta foi montada em memória (sem reler o banco): tem de ser igual ao re-read
    if (resposta && typeof resposta === 'object' && 'assignments' in resposta) {
      const relido = toDesignationView(buildReloaded() as any);
      const norm = (v: any) => JSON.stringify(v, (k, val) => (val instanceof Date ? val.toISOString() : val));
      if (norm(resposta) !== norm(relido)) {
        const A = norm(resposta),
          B = norm(relido);
        let i = 0;
        while (i < A.length && A[i] === B[i]) i++;
        console.log('      差异 em ' + i + ':\n         memória: ' + A.slice(Math.max(0, i - 60), i + 80) + '\n         re-read: ' + B.slice(Math.max(0, i - 60), i + 80));
      }
      check(`${c.name} — resposta em memória == re-read do banco`, norm(resposta) === norm(relido), 'a otimização de não reler mudou o payload');
    }
  });
}

console.log('\nupdatePointStatus — paridade com DesignationState.updatePointStatus\n');

casesResult.push(async () => {
  const model = buildModel({ members: [[P(1), false]], assignments: [{ id: 'a1', pointId: 'pt1', participants: [[P(1), false]] }] });
  const { service, ops } = makeHarness(model);
  await service.updatePointStatus(ID.A, 'pt1', { status: false }).catch(() => undefined);

  const del = ops.find((o) => o.name === 'ap.deleteMany');
  const upd = ops.find((o) => o.name === 'assignments.update');
  check('status=false apaga as linhas do ponto', del?.args?.where?.assignmentId === 'a1');
  check('status=false grava config_status=false', upd?.args?.data?.config_status === false);
});

casesResult.push(async () => {
  const model = buildModel({ members: [[P(1), false]], assignments: [{ id: 'a1', pointId: 'pt1', participants: [[P(1), false]] }] });
  const { service, ops } = makeHarness(model);
  await service.updatePointStatus(ID.A, 'pt1', { status: true }).catch(() => undefined);

  check('status=true não apaga linhas de participante', !ops.some((o) => o.name === 'ap.deleteMany'));
  check('status=true grava config_status=true', ops.find((o) => o.name === 'assignments.update')?.args?.data?.config_status === true);
});

console.log('\nregras de validação na resposta\n');

casesResult.push(async () => {
  const model = buildModel({ members: [[P(1), false]], assignments: [{ id: 'a1', pointId: 'pt1', participants: [[P(1), false]] }] });
  const { service } = makeHarness(model);
  const out: any = await service.updateParticipants(ID.A, 'pt1', { participants: [P(1)] }).catch((e) => {
    throw e;
  });
  check('ponto com 1 participante gera error', out.assignments?.[0]?.error === 'O ponto Ponto pt1 não pode ter apenas um participante', JSON.stringify(out?.assignments?.[0]));
});

casesResult.push(async () => {
  const model = buildModel({
    members: [
      [P(1), false],
      [P(2), false],
      [P(3), false],
    ],
    assignments: [{ id: 'a1', pointId: 'pt1', participants: [] }],
    max: 2,
  });
  const { service } = makeHarness(model);
  const out: any = await service.updateParticipants(ID.A, 'pt1', { participants: [P(1), P(2), P(3)] }).catch((e) => {
    throw e;
  });
  check(
    'ponto acima do limite gera error',
    typeof out.assignments?.[0]?.error === 'string' && out.assignments[0].error.includes('limite de ocupação'),
    JSON.stringify(out?.assignments?.[0]?.error),
  );
});

casesResult.push(async () => {
  const model = buildModel({
    members: [
      [P(1), false],
      [P(2), false],
    ],
    assignments: [
      {
        id: 'a1',
        pointId: 'pt1',
        participants: [
          [P(1), false],
          [P(2), false],
        ],
      },
    ],
  });
  const { service } = makeHarness(model);
  const out: any = await service.updateParticipants(ID.A, 'pt1', { participants: [P(1), P(2)] }).catch((e) => {
    throw e;
  });
  // a legacy escreve `error` em TODOS os assignments: `""` quando passa. Ausente
  // (undefined) mudaria o payload e quebraria `assignment.error ?? '...'` no front.
  check('ponto válido recebe error "" (a chave existe)', out.assignments?.[0]?.error === '', JSON.stringify(out?.assignments?.[0]?.error));
});

async function main() {
  for (const run of casesResult) await run();
  console.log(`\n${pass} ok, ${fail} falha(s)\n`);
  process.exit(fail ? 1 : 0);
}
main();
