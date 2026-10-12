/** Criação e ausência de designação: serviços reais, banco simulado, sem HMG/AWS. */
import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { DesignationWriteService } from '../src/modules/designations/designation-write.service';
import { DesignationViewService } from '../src/modules/designations/designation-view.service';

let checks = 0;
function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  checks++;
  console.log(`ok ${name}`);
}
function fixture(status = 'OPEN', existingStatus = 'ARCHIVED', withPoints = true) {
  const rows = [{ id: 'history', status: existingStatus }];
  const assignments: any[] = [];
  const carts: any[] = [];
  let locked = false;
  let tail = Promise.resolve();
  const group = { id: 'group', name: 'Teste', status, configWeekday: 'WEDNESDAY', configStartHour: '08:30', configEndHour: '13:00' };
  const db = {
    $transaction: async (run: any, options: any) => {
      check('transação lê estado recente após aguardar lock', options.isolationLevel === 'ReadCommitted');
      let unlock: (() => void) | undefined;
      const tx = {
        $queryRaw: async (sql: TemplateStringsArray, groupId: string) => {
          check('lock parametrizado no grupo correto', sql.join('?').includes('FOR UPDATE') && groupId === 'group');
          const previous = tail;
          tail = new Promise<void>((done) => {
            unlock = done;
          });
          await previous;
          locked = true;
          return [{ id: groupId }];
        },
        groups: {
          findUnique: async () => {
            assert.ok(locked);
            return group;
          },
        },
        designations: {
          findFirst: async ({ where }: any) => {
            assert.equal(where.status.not, 'ARCHIVED');
            return rows.find((row) => row.status !== 'ARCHIVED') || null;
          },
          create: async ({ data }: any) => {
            const row = { id: 'created', ...data };
            rows.push(row);
            return row;
          },
        },
        pointPublicationCart: {
          findMany: async () =>
            withPoints
              ? [
                  { pointId: 'p1', publicationCartId: 'c1', maxParticipants: 4, minParticipants: 2, status: true },
                  { pointId: 'p1', publicationCartId: 'c2', maxParticipants: 4, minParticipants: 2, status: true },
                  { pointId: 'p2', publicationCartId: 'c3', maxParticipants: 2, minParticipants: 2, status: false },
                ]
              : [],
        },
        assignments: {
          create: async ({ data }: any) => {
            const row = { id: `a${assignments.length}`, ...data };
            assignments.push(row);
            return row;
          },
        },
        assignmentsPublicationCart: {
          create: async ({ data }: any) => {
            carts.push(data);
          },
        },
      };
      try {
        return await run(tx);
      } finally {
        locked = false;
        unlock?.();
      }
    },
  };
  const service = new DesignationWriteService(db as any, {} as any, {} as any, {} as any, {} as any);
  return { service, rows, assignments, carts };
}

async function main() {
  const concurrent = fixture();
  const results = await Promise.allSettled([concurrent.service.create('group'), concurrent.service.create('group')]);
  check('duas criações simultâneas geram apenas uma designação', results.filter((r) => r.status === 'fulfilled').length === 1 && concurrent.rows.length === 2);
  const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
  check('a segunda criação responde conflito 409', rejected.reason.getStatus() === 409);
  check('histórico arquivado permanece intacto', concurrent.rows[0].id === 'history' && concurrent.rows[0].status === 'ARCHIVED');
  check('pontos distintos geram assignments sem duplicar carrinhos', concurrent.assignments.length === 2 && concurrent.carts.length === 3);
  check('mantém configuração e ponto desativado', concurrent.assignments[1].config_status === false && concurrent.assignments[0].config_max === 4);

  for (const status of ['OPEN', 'IN_PROGRESS', 'CLOSED', 'CANCELLED']) {
    const existing = fixture('OPEN', status);
    await assert.rejects(existing.service.create('group'), (e: any) => e.getStatus() === 409);
    check(`não duplica designação ${status}`, existing.rows.length === 1);
  }
  const closed = fixture('CLOSED');
  await assert.rejects(closed.service.create('group'), (e: any) => e.getStatus() === 400);
  check('grupo fechado não recebe designação', closed.rows.length === 1);
  const empty = fixture('OPEN', 'ARCHIVED', false);
  await assert.rejects(empty.service.create('group'), (e: any) => e.getStatus() === 400);
  check('grupo sem pontos não gera designação vazia', empty.rows.length === 1);

  for (const group of [{ status: 'OPEN' }, { status: 'CLOSED' }, null]) {
    const view = new DesignationViewService({
      designations: { findFirst: async () => null },
      groups: { findUnique: async () => group },
    } as any);
    try {
      await view.findByGroupId('group');
      assert.fail('deveria responder 404');
    } catch (error) {
      const body = (error as any).getResponse();
      check('404 diferencia grupo inexistente de designação ausente', body.code === (group ? 'DESIGNATION_NOT_FOUND' : 'GROUP_NOT_FOUND'));
      if (group) check('informa status do grupo no estado ausente', body.groupStatus === group.status);
    }
  }
  console.log(`\n${checks} verificações de criação/ausência passaram, sem banco real.`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
