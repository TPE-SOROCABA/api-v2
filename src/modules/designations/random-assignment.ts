import { BadRequestException } from '@nestjs/common';
import { DesignationStatus, GroupType, ParticipantGroupProfile } from '@prisma/client';

import { DesignationView, DesignationViewAssignment, DesignationViewParticipant } from './designation-view.types';

/**
 * Port 1:1 de `api/src/domain/GenerateAssignments.ts` + `Designation.generateAssignment()`.
 *
 * Sorteia quem fica em cada ponto, com duas regras:
 *  - capitão (e o perfil COORDINATOR, comparação morta que a legacy fazia) nunca
 *    entra por sorteio — ele é escalado na mão;
 *  - um ponto com **um** participante só aceita alguém do mesmo sexo; a partir de
 *    dois, entra qualquer um.
 *
 * É a mesma lógica (inclusive a repetição de `splice` dentro do `for...of`, que
 * pula o elemento following o removido) do arquivo original. Reescrever "melhor"
 * aqui mudaria o sorteio e, portanto, o que o capitão vê na tela.
 *
 * ## Sem `GenderRequirementRule`
 * A legacy rodava `applyValidations()` depois do sorteio e derrubava a designação
 * inteira se sobrasse dupla mista. Como a dupla homem+mulher passou a ser
 * permitida (decisão do usuário), essa regra não é aplicada aqui — igual ao que
 * já vale nas rotas de escrita da Fase 4.
 */

/** `ParticipantProfile.COORDINATOR` da legacy: não existe em `ParticipantGroupProfile`. */
function isCaptain(p: DesignationViewParticipant): boolean {
  return p.profile === ParticipantGroupProfile.CAPTAIN;
}

function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/** `retryGenerateAssignment`: sobrou gente sem ponto, ou sobrou ponto com um só. */
function needsRetry(view: DesignationView): boolean {
  const oneParticipantAssignment = view.assignments.some((a) => a.participants.length === 1);
  // `captainsAndCoordinatorsNumber` da legacy conta capitões do POOL de
  // disponíveis (`designation.participants`), não dos pontos — e o sorteio nunca
  // escala capitão, então a diferença é exatamente quantos sobraram sem ponto.
  const captainsInPool = view.participants.filter(isCaptain).length;
  return view.participants.length > captainsInPool || oneParticipantAssignment;
}

function tryOnce(view: DesignationView, statusPtBr: (s: DesignationStatus) => string): void {
  if (view.status !== DesignationStatus.OPEN) {
    throw new BadRequestException(`Designação não pode ser enviada, pois está ${statusPtBr(view.status)}`);
  }

  // `reset()`: todo mundo volta para a lista de disponíveis
  for (const assignment of view.assignments) {
    view.participants.push(...assignment.participants);
    assignment.participants = [];
  }

  shuffle(view.assignments);

  for (const assignment of view.assignments) {
    if (!assignment.point.status) continue;
    shuffle(view.participants);

    // `randomIndex` sobre um array de 2 => min OU max, nunca outro valor
    const minMax = [assignment.config.min, assignment.config.max];
    const target = minMax[Math.floor(Math.random() * minMax.length)];
    let placed = 0;

    for (const [index, participant] of view.participants.entries()) {
      if (isCaptain(participant)) continue;
      if (placed === target) break;

      const current = assignment.participants.length;
      if (current === 0) {
        assignment.participants.push(participant);
        view.participants.splice(index, 1);
        placed++;
        continue;
      }
      // ponto com 1: só aceita o mesmo sexo. Se for outro, cai no caso de baixo,
      // que não faz nada — a pessoa é deixada na lista.
      if (current === 1 && assignment.participants.some((p) => p.sex === participant.sex)) {
        assignment.participants.push(participant);
        view.participants.splice(index, 1);
        placed++;
        continue;
      }
      if (current === 2) {
        assignment.participants.push(participant);
        view.participants.splice(index, 1);
        placed++;
        continue;
      }
    }
  }
}

/**
 * Sorteia a designação, repetindo enquanto sobrar gente sem ponto ou ponto com
 * um só. `retry` é o teto de tentativas (500 na legacy).
 *
 * Devolve a view mutada — quem chama persiste e responde.
 */
export function generateRandomAssignment(view: DesignationView, statusPtBr: (s: DesignationStatus) => string, retry = 500): DesignationView {
  let attempts = 0;

  for (;;) {
    tryOnce(view, statusPtBr);
    attempts++;

    if (!needsRetry(view)) return view;
    if (attempts >= retry) break;
  }

  // Grupo especial tolera gente sem ponto; os outros não.
  if (view.group.type === GroupType.SPECIAL) return view;

  const totalParticipants = view.participants.length + view.assignments.reduce((sum, a) => sum + a.participants.length, 0);
  const totalVacancies = view.assignments.filter((a) => a.point.status).reduce((sum, a) => sum + a.config.max, 0);

  throw new BadRequestException(`Não foi possível designar todos os participantes. Total participantes: ${totalParticipants}, Total vagas: ${totalVacancies}`);
}

/**
 * "A designação sorteada é igual à anterior?"
 *
 * Conta os pontos que têm **pelo menos dois** participantes em comum com algum
 * ponto da designação antiga. O limite aceitável depende do número de homens:
 * até 2 homens, uma duplicação é tolerada (para não ficar infinitamente
 * rejeitando); acima disso, nenhuma.
 */
function compareGroups(first: string[][], second: string[][], limit = 0): boolean {
  let matchCount = 0;
  for (const firstSub of first) {
    if (matchCount > limit) break;
    for (const secondSub of second) {
      if (matchCount > limit) break;
      if (firstSub.filter((member) => secondSub.includes(member)).length >= 2) matchCount++;
    }
  }
  return matchCount > limit;
}

/**
 * Port de `isSameAsPreviousDesignation`. Compara por NOME (não por id), que é o
 * que a legacy fazia.
 */
export function isSameAsPreviousDesignation(newView: DesignationView, oldView: DesignationView): boolean {
  const namesOf = (view: DesignationView) => view.assignments.map((a: DesignationViewAssignment) => a.participants.map((p) => p.name));

  let maleCount = 0;
  const newNames = namesOf(newView).map((names, i) => {
    maleCount += newView.assignments[i].participants.filter((p) => p.sex === 'MALE').length;
    return names;
  });

  const limit = maleCount > 2 ? 0 : 1;
  return compareGroups(newNames, namesOf(oldView), limit);
}
