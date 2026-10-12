/**
 * Paridade do sorteio (`?random`, Fase 5).
 *
 * Compara `generateRandomAssignment` / `isSameAsPreviousDesignation` com a
 * implementação da legacy COPIADA aqui (`GenerateAssignments` +
 * `isSameAsPreviousDesignation`), usando a MESMA sequência de `Math.random` nos
 * dois lados — sem isso a comparação seria sorteio contra sorteio.
 *
 * Roda com:
 *   npx ts-node -T -r tsconfig-paths/register scripts/check-random-assignment-parity.ts
 */
import { ParticipantGroupProfile } from '@prisma/client';

import { generateRandomAssignment, isSameAsPreviousDesignation } from 'src/modules/designations/random-assignment';
import { DesignationView, DesignationViewAssignment, DesignationViewParticipant } from 'src/modules/designations/designation-view.types';

const P = (n: number) => `p${n}`;

// ----------------------------------------------------------------------------------------
// legacy copiada
// ----------------------------------------------------------------------------------------

interface LegacyParticipant {
  id: string;
  name: string;
  sex: string;
  profile?: string;
}
interface LegacyAssignment {
  id: string;
  point: { name: string; status: boolean };
  participants: LegacyParticipant[];
  config: { min: number; max: number };
}
interface LegacyDesignation {
  group: { type: string };
  status: string;
  assignments: LegacyAssignment[];
  participants: LegacyParticipant[];
}

const randomIndex = (array: Array<number>) => Math.floor(Math.random() * array.length);

class LegacyGenerateAssignments {
  count = 0;
  constructor(public designation: LegacyDesignation) {}

  generateAssignment(retry = 500): void {
    if (this.designation.status !== 'OPEN') throw new Error(`status ${this.designation.status}`);
    this.reset();
    this.shuffle(this.designation.assignments);

    for (const assignment of this.designation.assignments) {
      if (!assignment.point.status) continue;
      this.shuffle(this.designation.participants);
      const minMax = [assignment.config.min, assignment.config.max];
      const min = minMax[randomIndex(minMax)];
      let loopCount = 0;

      for (const [index, participant] of this.designation.participants.entries()) {
        if (participant.profile === 'CAPTAIN' || participant.profile === 'COORDINATOR') continue;
        if (min === loopCount) break;
        if (assignment.participants.length === 0) {
          assignment.participants.push(participant);
          this.designation.participants.splice(index, 1);
          loopCount++;
          continue;
        }
        if (assignment.participants.length === 1) {
          if (assignment.participants.map((p) => p.sex).includes(participant.sex)) {
            assignment.participants.push(participant);
            this.designation.participants.splice(index, 1);
            loopCount++;
            continue;
          }
        }
        if (assignment.participants.length === 2) {
          assignment.participants.push(participant);
          this.designation.participants.splice(index, 1);
          loopCount++;
          continue;
        }
      }
    }

    if (this.retryGenerateAssignment()) {
      if (this.count < retry) {
        this.generateAssignment(retry);
      } else {
        if (this.designation.group.type === 'SPECIAL') return;
        // mensagem completa da legacy (Designation.getNextDate/getters)
        const participantsCount = this.designation.participants.length + this.designation.assignments.reduce((s, a) => s + a.participants.length, 0);
        const totalVacancies = this.designation.assignments
          .filter((a) => a.point.status)
          .map((a) => a.config.max)
          .reduce((s, max) => s + max, 0);
        throw new Error(`Não foi possível designar todos os participantes. Total participantes: ${participantsCount}, Total vagas: ${totalVacancies}`);
      }
    }
  }

  private retryGenerateAssignment() {
    const captains = this.designation.participants.filter((p) => p.profile === 'CAPTAIN' || p.profile === 'COORDINATOR').length;
    const one = this.designation.assignments.some((a) => a.participants.length === 1);
    return this.designation.participants.length > captains || one;
  }

  private reset() {
    this.count++;
    this.designation.assignments.forEach((a) => {
      this.designation.participants.push(...a.participants);
      a.participants = [];
    });
  }

  private shuffle(array: Array<any>) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
}

function legacyCompareGroups(firstGroup: string[][], secondGroup: string[][], limit = 0) {
  let matchCount = 0;
  firstGroup.forEach((firstSubGroup) => {
    if (matchCount > limit) return;
    secondGroup.forEach((secondSubGroup) => {
      if (matchCount > limit) return;
      if (firstSubGroup.filter((m) => secondSubGroup.includes(m)).length >= 2) matchCount++;
    });
  });
  return matchCount > limit;
}

function legacyIsSame(newD: LegacyDesignation, oldD: LegacyDesignation) {
  const newSimple: string[][] = [];
  const oldSimple: string[][] = [];
  let maleCount = 0;
  newD.assignments.forEach((a) => {
    maleCount += a.participants.filter((p) => p.sex === 'MALE').length;
    newSimple.push(a.participants.map((p) => p.name));
  });
  oldD.assignments.forEach((a) => oldSimple.push(a.participants.map((p) => p.name)));
  return legacyCompareGroups(newSimple, oldSimple, maleCount > 2 ? 0 : 1);
}

// ----------------------------------------------------------------------------------------
// fixtures (o mesmo dado nos dois formatos)
// ----------------------------------------------------------------------------------------

type Member = [string, ParticipantGroupProfile, 'MALE' | 'FEMALE'];

function fixture(members: Member[], points: { min: number; max: number; status: boolean; active: boolean }[]) {
  const participants = members.map(([id, profile, sex]) => ({ id, name: id, profile, sex }));
  const assignments = points.map((pt, i) => ({
    id: `a${i + 1}`,
    point: { id: `pt${i + 1}`, name: `Ponto ${i + 1}`, status: pt.status },
    participants: [] as typeof participants,
    config: { min: pt.min, max: pt.max },
    active: pt.active,
  }));

  // mesmo shape de view
  const view: DesignationView = {
    id: 'd1',
    group: { id: 'g1', name: 'G', whatsappId: null, type: 'MAIN', config: { endHour: '21:00', startHour: '19:00', weekday: 'MONDAY', minParticipants: 2, maxParticipants: 8 } },
    status: 'OPEN',
    assignments: assignments as unknown as DesignationViewAssignment[],
    participants: participants as unknown as DesignationViewParticipant[],
    createdAt: new Date(),
    updatedAt: new Date(),
    incidents: [],
    assignmentsFiltered: [],
    cancellationJustification: '',
    mandatoryPresence: true,
    total: { participants: participants.length, vacancies: 0 },
  };

  const legacy: LegacyDesignation = {
    group: { type: 'MAIN' },
    status: 'OPEN',
    assignments: assignments.map((a) => ({
      id: a.id,
      point: { name: a.point.name, status: a.point.status },
      participants: [],
      config: a.config,
    })),
    participants: participants.map((p) => ({ ...p })),
  };

  return { view, legacy };
}

/** PRNG determinístico, para os dois lados sortearem EXATAMENTE a mesma sequência. */
function seedRandom(seed: number) {
  let s = seed;
  const original = Math.random;
  Math.random = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  return () => {
    Math.random = original;
  };
}

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

const signature = (assignments: { participants: { name: string }[] }[]) =>
  assignments
    .map((a) =>
      a.participants
        .map((p) => p.name)
        .sort()
        .join('+'),
    )
    .sort()
    .join('|');

console.log('\nGenerateAssignments — mesma sequência de Math.random nos dois lados\n');

const cases: [string, Member[], { min: number; max: number; status: boolean; active: boolean }[], number][] = [
  [
    '4 pessoas, 2 pontos de 2',
    [
      [P(1), 'PARTICIPANT', 'MALE'],
      [P(2), 'PARTICIPANT', 'FEMALE'],
      [P(3), 'PARTICIPANT', 'MALE'],
      [P(4), 'PARTICIPANT', 'FEMALE'],
    ],
    [
      { min: 2, max: 2, status: true, active: true },
      { min: 2, max: 2, status: true, active: true },
    ],
    7,
  ],
  [
    'só homens: ponto com 1 rejeita o segundo',
    [
      [P(1), 'PARTICIPANT', 'MALE'],
      [P(2), 'PARTICIPANT', 'MALE'],
      [P(3), 'PARTICIPANT', 'MALE'],
    ],
    [{ min: 1, max: 3, status: true, active: true }],
    3,
  ],
  [
    'min e max diferentes (sorteia entre os dois)',
    [
      [P(1), 'PARTICIPANT', 'FEMALE'],
      [P(2), 'PARTICIPANT', 'MALE'],
      [P(3), 'PARTICIPANT', 'MALE'],
    ],
    [{ min: 1, max: 2, status: true, active: true }],
    11,
  ],
  [
    'capitão nunca é escalado pelo sorteio',
    [
      [P(1), 'CAPTAIN', 'MALE'],
      [P(2), 'PARTICIPANT', 'MALE'],
      [P(3), 'PARTICIPANT', 'FEMALE'],
    ],
    [{ min: 2, max: 2, status: true, active: true }],
    5,
  ],
  [
    'ponto desativado fica vazio',
    [
      [P(1), 'PARTICIPANT', 'MALE'],
      [P(2), 'PARTICIPANT', 'FEMALE'],
    ],
    [
      { min: 2, max: 2, status: true, active: true },
      { min: 2, max: 2, status: false, active: false },
    ],
    9,
  ],
  ['vagas de sobra: sobram sem ponto', [[P(1), 'PARTICIPANT', 'MALE']], [{ min: 3, max: 4, status: true, active: true }], 13],
];

for (const [name, members, points, seed] of cases) {
  const restore = seedRandom(seed);
  const { view, legacy } = fixture(members, points);
  const gen = new LegacyGenerateAssignments(legacy);
  let legacyErr = '';
  try {
    gen.generateAssignment();
  } catch (e: any) {
    legacyErr = e.message;
  }
  const legacySig = signature(legacy.assignments);
  restore();

  const restore2 = seedRandom(seed);
  let apiErr = '';
  try {
    generateRandomAssignment(view, (s) => s);
  } catch (e: any) {
    apiErr = e.message;
  }
  const apiSig = signature(view.assignments);
  restore2();

  check(name, legacySig === apiSig && legacyErr === apiErr, `legacy=${legacySig}${legacyErr ? ` (${legacyErr})` : ''} api-v2=${apiSig}${apiErr ? ` (${apiErr})` : ''}`);
}

console.log('\nisSameAsPreviousDesignation\n');

{
  const { view: a, legacy: la } = fixture(
    [
      [P(1), 'PARTICIPANT', 'MALE'],
      [P(2), 'PARTICIPANT', 'FEMALE'],
    ],
    [{ min: 2, max: 2, status: true, active: true }],
  );
  const { view: b, legacy: lb } = fixture(
    [
      [P(1), 'PARTICIPANT', 'MALE'],
      [P(2), 'PARTICIPANT', 'FEMALE'],
    ],
    [{ min: 2, max: 2, status: true, active: true }],
  );
  a.assignments[0].participants = [...a.participants];
  a.participants = [];
  b.assignments[0].participants = [...b.participants];
  b.participants = [];
  la.assignments[0].participants = [...la.participants];
  la.participants = [];
  lb.assignments[0].participants = [...lb.participants];
  lb.participants = [];

  check('mesma dupla -> mesma designação', legacyIsSame(la, lb) === isSameAsPreviousDesignation(a, b));
}
{
  // 3 homens => limite 0: qualquer ponto com 2 em comum já conta como repetida
  const { view: a, legacy: la } = fixture(
    [
      [P(1), 'PARTICIPANT', 'MALE'],
      [P(2), 'PARTICIPANT', 'MALE'],
      [P(3), 'PARTICIPANT', 'MALE'],
    ],
    [{ min: 3, max: 3, status: true, active: true }],
  );
  const { view: b, legacy: lb } = fixture(
    [
      [P(1), 'PARTICIPANT', 'MALE'],
      [P(2), 'PARTICIPANT', 'MALE'],
      [P(3), 'PARTICIPANT', 'MALE'],
    ],
    [{ min: 3, max: 3, status: true, active: true }],
  );
  for (const v of [a, b]) {
    v.assignments[0].participants = [...v.participants];
    v.participants = [];
  }
  for (const l of [la, lb]) {
    l.assignments[0].participants = [...l.participants];
    l.participants = [];
  }
  check('3 homens: mesma dupla -> repetida', legacyIsSame(la, lb) === isSameAsPreviousDesignation(a, b), `legacy=${legacyIsSame(la, lb)} api=${isSameAsPreviousDesignation(a, b)}`);
}
{
  const { view: a, legacy: la } = fixture(
    [
      [P(1), 'PARTICIPANT', 'MALE'],
      [P(2), 'PARTICIPANT', 'FEMALE'],
    ],
    [{ min: 2, max: 2, status: true, active: true }],
  );
  const { view: b, legacy: lb } = fixture(
    [
      [P(3), 'PARTICIPANT', 'MALE'],
      [P(4), 'PARTICIPANT', 'FEMALE'],
    ],
    [{ min: 2, max: 2, status: true, active: true }],
  );
  for (const v of [a, b]) {
    v.assignments[0].participants = [...v.participants];
    v.participants = [];
  }
  for (const l of [la, lb]) {
    l.assignments[0].participants = [...l.participants];
    l.participants = [];
  }
  check('duplas diferentes -> não é repetida', legacyIsSame(la, lb) === isSameAsPreviousDesignation(a, b));
}

console.log(`\n${pass} ok, ${fail} falha(s)\n`);
process.exit(fail ? 1 : 0);
