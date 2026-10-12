import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DesignationStatus, GroupStatus, GroupType, ParticipantGroupProfile, Prisma } from '@prisma/client';

import { PrismaService } from 'src/infra/prisma/prisma.service';
import { MessageGeneratorService, MessageType } from 'src/shared/message-generator.service';
import { ShortLinkService } from 'src/shared/short-link.service';
import { generateRandomAssignment, isSameAsPreviousDesignation } from './random-assignment';
import { SqsDispatcherService } from 'src/infra/sqs/sqs-dispatcher.service';
import { WEEKDAY_PT_BR } from 'src/shared/weekday.util';
import { DesignationModel, designationViewInclude, filterDesignationAssignments, toDesignationView } from './designation-view.mapper';
import { DesignationView, DesignationViewParticipant } from './designation-view.types';
import { DesignationViewService } from './designation-view.service';
import {
  CancelDesignationDto,
  UpdateMandatoryPresenceDto,
  SendDesignationDto,
  UpdateManyPointsDto,
  UpdatePointParticipantsDto,
  UpdatePointStatusDto,
} from './dto/designation-write.dto';

/** Paridade com `api/src/enums/DesignationStatusPT_BR.ts` — a mensagem vai crua pro front. */
const DESIGNATION_STATUS_PT_BR: Record<DesignationStatus, string> = {
  OPEN: 'aberta',
  IN_PROGRESS: 'em andamento',
  CLOSED: 'fechada',
  ARCHIVED: 'arquivada',
  CANCELLED: 'cancelada',
};

/**
 * Escrita de designação, portada dos handlers da legacy
 * (`api/src/functions/designations/{createDesignations,cancelDesignations,
 * reopenDesignation,updatePointDesignations,patchMandatoryPresence,
 * updateParticipantsPointDesignations}.ts`).
 *
 * ## Por que não existe um agregado de domínio aqui
 * A legacy carregava a designação inteira, mutava em memória e publicava o
 * agregado JSON na fila FIFO; o consumidor (`updateDesignations.handler` →
 * `DesignationRepository.update`) fazia `deleteMany` + `createMany` em
 * `assignments_participants` e ainda reescrevia `designations.status` e
 * `assignments.config_*` com valores lidos ANTES da fila. Duas designações
 * editadas ao mesmo tempo se sobrescreviam.
 *
 * Aqui a escrita é direta, numa transação, e só toca no que de fato mudou.
 * Mesmo efeito final no banco, sem a janela de corrida e sem a latência da fila.
 * O consumidor da fila e os produtores da legacy permanecem intactos.
 * Este BFF persiste edições diretamente e publica notificações na fila de WhatsApp.
 */
@Injectable()
export class DesignationWriteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sqs: SqsDispatcherService,
    private readonly messages: MessageGeneratorService,
    private readonly shortLinks: ShortLinkService,
    private readonly viewService: DesignationViewService,
  ) {}

  // ------------------------------------------------------------------------------------
  // POST /designations?groupId=
  // ------------------------------------------------------------------------------------

  /**
   * Port de `CreateDesignationUseCase`: cria a designação da próxima ocorrência
   * do grupo e um `assignments` por ponto de publicação, com os mesmos
   * `config_*` do `point_publication_carts`.
   */
  async create(groupId: string): Promise<{ message: string }> {
    await this.prisma.$transaction(
      async (tx) => {
        // Serializa criações do BFF por grupo. ReadCommitted garante que quem
        // esperou o lock veja a designação criada pela transação anterior.
        await tx.$queryRaw`SELECT "id" FROM "groups" WHERE "id" = ${groupId} FOR UPDATE`;
        const group = await tx.groups.findUnique({ where: { id: groupId } });
        if (!group) throw new NotFoundException('Grupo não encontrado');
        if (group.status !== GroupStatus.OPEN) throw new BadRequestException('Não é possível criar designação para um grupo fechado');
        const existing = await tx.designations.findFirst({
          where: { groupId, status: { not: DesignationStatus.ARCHIVED } },
          select: { id: true },
        });
        if (existing) throw new ConflictException('Este grupo já possui uma designação atual');
        const designationDate = this.nextDate(new Date(), group.configWeekday, group.configStartHour);
        const pointPublicationCart = await tx.pointPublicationCart.findMany({
          where: { groupId },
        });
        if (!pointPublicationCart.length) throw new BadRequestException('Cadastre pontos para o grupo antes de criar uma designação');

        // pontos distintos, na ordem em que apareceram
        const pointIds: string[] = [];
        for (const point of pointPublicationCart) {
          if (!pointIds.includes(point.pointId)) pointIds.push(point.pointId);
        }

        const designation = await tx.designations.create({
          data: {
            name: `Designação ${group.name}`,
            groupId,
            status: DesignationStatus.OPEN,
            designationDate,
            designationEndDate: this.endDateTime(designationDate, group.configEndHour),
          },
        });

        for (const pointId of pointIds) {
          const cart = pointPublicationCart.find((p) => p.pointId === pointId)!;
          const assignment = await tx.assignments.create({
            data: {
              designationsId: designation.id,
              pointId,
              config_max: cart.maxParticipants,
              config_min: cart.minParticipants,
              config_status: cart.status,
            },
          });

          for (const cartRow of pointPublicationCart.filter((p) => p.pointId === pointId)) {
            await tx.assignmentsPublicationCart.create({
              data: { assignmentId: assignment.id, publicationCartId: cartRow.publicationCartId },
            });
          }
        }
      },
      {
        maxWait: 10000,
        timeout: 15000,
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      },
    );

    return { message: 'Designação criada com sucesso!' };
  }

  private nextDate(today: Date, weekday: string, startHour: string): Date {
    const weekDay = this.weekdayIndex(weekday);
    const date = new Date(today);
    date.setDate(today.getDate() + ((weekDay + 7 - today.getDay()) % 7));
    const [hours, minutes] = startHour.split(':');
    date.setHours(Number(hours));
    date.setMinutes(Number(minutes));

    if (date < today) date.setDate(date.getDate() + 7);
    return date;
  }

  private endDateTime(designationDate: Date, endHour: string): Date {
    const end = new Date(designationDate);
    const [hours, minutes] = endHour.split(':');
    end.setHours(Number(hours));
    end.setMinutes(Number(minutes));
    return end;
  }

  private weekdayIndex(weekday: string): number {
    const order = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const index = order.indexOf(weekday);
    return index === -1 ? 0 : index;
  }

  // ------------------------------------------------------------------------------------
  // PATCH /designations/:id/cancel
  // ------------------------------------------------------------------------------------

  async cancel(designationId: string, dto: CancelDesignationDto): Promise<DesignationView> {
    const designation = await this.load(designationId);

    await this.prisma.designations.update({
      where: { id: designation.id },
      data: {
        status: DesignationStatus.CANCELLED,
        cancellationJustification: dto.justification,
        updatedAt: new Date(),
      },
    });

    // Notificação de cancelamento só quando o grupo tem WhatsApp configurado.
    if (designation.group.whatsappId) {
      const message = this.messages.generate(MessageType.CANCELLATION_GROUP, {
        recipientName: designation.group.name,
        details: `${WEEKDAY_PT_BR[designation.group.configWeekday]}, das *${designation.group.configStartHour} às ${designation.group.configEndHour}*`,
      });
      await this.sqs.dispatch({
        phone: designation.group.whatsappId,
        message,
        type: 'text',
        title: `${designation.group.name} - Cancelamento`,
      });
    }

    return this.view(designationId);
  }

  // ------------------------------------------------------------------------------------
  // PATCH /designations/:id/reopen
  // ------------------------------------------------------------------------------------

  async reopen(designationId: string): Promise<DesignationView> {
    const designation = await this.load(designationId);
    if (designation.status !== DesignationStatus.CANCELLED) {
      throw new BadRequestException('Apenas designações canceladas podem ser reabertas.');
    }

    await this.prisma.designations.update({
      where: { id: designation.id },
      data: {
        status: DesignationStatus.OPEN,
        cancellationJustification: '',
        updatedAt: new Date(),
      },
    });

    return this.view(designationId);
  }

  // ------------------------------------------------------------------------------------
  // PATCH /designations/:id/points/:pointId
  // ------------------------------------------------------------------------------------

  async updatePointStatus(designationId: string, pointId: string, dto: UpdatePointStatusDto): Promise<DesignationView> {
    const designation = await this.load(designationId);
    this.assertEditable(designation);

    const assignment = designation.assignments.find((a) => a.point.id === pointId);
    if (!assignment) throw new NotFoundException('Ponto não encontrado');

    await this.prisma.$transaction([
      // desativar o ponto devolve todo mundo para a lista de não escalados, o
      // que no banco é a remoção das linhas de `assignments_participants`
      ...(dto.status
        ? []
        : [
            this.prisma.assignmentsParticipants.deleteMany({
              where: { assignmentId: assignment.id },
            }),
          ]),
      this.prisma.assignments.update({
        where: { id: assignment.id },
        data: { config_status: dto.status },
      }),
      this.prisma.designations.update({
        where: { id: designation.id },
        data: { updatedAt: new Date() },
      }),
    ]);

    return this.view(designationId);
  }

  // ------------------------------------------------------------------------------------
  // PATCH /designations/:id/optional
  // ------------------------------------------------------------------------------------

  async setMandatoryPresence(designationId: string, dto: UpdateMandatoryPresenceDto): Promise<DesignationView> {
    const designation = await this.load(designationId);

    await this.prisma.designations.update({
      where: { id: designation.id },
      data: { mandatoryPresence: !dto.optional, updatedAt: new Date() },
    });

    return this.view(designationId);
  }

  // ------------------------------------------------------------------------------------
  // PUT /designations/:id/points/:pointId/participants
  // ------------------------------------------------------------------------------------

  /**
   * Port de `DesignationState.updateParticipants`.
   *
   * Regra importante da paridade: **a validação NÃO bloqueia a gravação**. Na
   * legacy, `applyValidations()` roda dentro de um try/catch que devolve
   * `false`, e o handler ignora esse retorno — salva assim mesmo e devolve o
   * erro no `assignment.error`, que o front mostra como aviso no card. aqui o
   * mesmo: grava sempre e anota o erro na resposta.
   *
   * E o ponto de entrada só é quem está na lista de não escalados: se o id
   * vier de alguém com falta aberta, ele não entra. É o mesmo efeito do splice
   * da legacy.
   */
  async updateParticipants(designationId: string, pointId: string, dto: UpdatePointParticipantsDto): Promise<DesignationView> {
    const designation = await this.load(designationId);
    this.assertEditable(designation);

    const assignment = designation.assignments.find((a) => a.point.id === pointId);
    if (!assignment) throw new NotFoundException('Ponto não encontrado');

    const wanted = new Set(dto.participants);

    // Quem tem falta ABERTA nesta designação não pode ser escalado — a legacy faz
    // esse filtro em `Designation.setup()`, tirando a pessoa tanto da lista de
    // membros disponíveis quanto dos pontos onde já estava. Aplicado aqui sobre a
    // união dos dois, para não deixar passar quem já estava escalado.
    const withOpenIncident = new Set<string>();
    const addIfBlocked = (id: string, incidents: { designationId: string; status: string }[]) => {
      if (incidents.some((i) => i.designationId === designation.id && i.status === 'OPEN')) {
        withOpenIncident.add(id);
      }
    };
    for (const pg of designation.group.participantsGroup) {
      addIfBlocked(pg.participantId, pg.participant.incidentParticipant);
    }
    for (const a of designation.assignments) {
      for (const ap of a.assignmentsParticipants) addIfBlocked(ap.participantId, ap.participant.incidentParticipant);
    }

    // O "pool" da legacy: quem está disponível (membro do grupo ou já escalado em
    // algum ponto) e não está bloqueado por falta aberta. Incluir os já escalados
    // é o que permite mover alguém de um ponto para outro.
    const pool = new Set<string>();
    for (const pg of designation.group.participantsGroup) {
      if (!withOpenIncident.has(pg.participantId)) pool.add(pg.participantId);
    }
    for (const a of designation.assignments) {
      for (const ap of a.assignmentsParticipants) {
        if (!withOpenIncident.has(ap.participantId)) pool.add(ap.participantId);
      }
    }

    // passo 3 da legacy: o ponto fica exatamente com `pool ∩ ids pedidos`
    const finalIds = new Set([...pool].filter((id) => wanted.has(id)));

    await this.prisma.$transaction([
      // limpa o ponto de destino
      this.prisma.assignmentsParticipants.deleteMany({ where: { assignmentId: assignment.id } }),
      // limpa dos demais pontos quem foi movido
      this.prisma.assignmentsParticipants.deleteMany({
        where: {
          participantId: { in: [...wanted] },
          assignmentId: { not: assignment.id },
          assignment: { designationsId: designation.id },
        },
      }),
      this.prisma.assignmentsParticipants.createMany({
        data: [...finalIds].map((participantId) => ({
          assignmentId: assignment.id,
          participantId,
        })),
      }),
      this.prisma.designations.update({
        where: { id: designation.id },
        data: { updatedAt: new Date() },
      }),
    ]);

    // A resposta sai do MESMO objeto já carregado, aplicando a mudança em memória —
    // como a legacy, que respondia com o agregado que tinha acabado de mandar
    // para a fila. Reler aqui custava uma segunda consulta pesada (o include de
    // designação), e o auto-assign chama esta rota uma vez por ponto: com 24
    // pontos, eram 48 consultas onde cabia uma por ponto.
    applyToModel(designation, assignment.id, finalIds);
    const view = toDesignationView(designation);
    return dto.filter ? filterDesignationAssignments(view, dto.filter) : view;
  }

  // ------------------------------------------------------------------------------------
  // PUT /designations/:id/participants — aplicação em lote
  // ------------------------------------------------------------------------------------

  async updateManyParticipants(designationId: string, dto: UpdateManyPointsDto): Promise<DesignationView> {
    const designation = await this.load(designationId);
    this.assertEditable(designation);

    // Valida todos os pontos antes de gravar qualquer mudança.
    const targets = dto.assignments.map((item) => {
      const assignment = designation.assignments.find((a) => a.pointId === item.pointId);
      if (!assignment) throw new NotFoundException('Ponto não encontrado');
      return { assignment, item };
    });
    const blocked = new Set<string>();
    const pool = new Set<string>();
    const members = [
      ...designation.group.participantsGroup.map((pg) => pg.participant),
      ...designation.assignments.flatMap((a) => a.assignmentsParticipants.map((ap) => ap.participant)),
    ];
    for (const participant of members) {
      pool.add(participant.id);
      if (participant.incidentParticipant.some((i) => i.designationId === designation.id && i.status === 'OPEN')) {
        blocked.add(participant.id);
      }
    }
    // Mesma ordem do PUT unitário: o último ponto solicitado ganha o participante.
    for (const { assignment, item } of targets) {
      const wanted = new Set(item.participantIds);
      const ids = new Set([...pool].filter((id) => wanted.has(id) && !blocked.has(id)));
      applyToModel(designation, assignment.id, ids);
    }

    const targetIds = [...new Set(targets.map(({ assignment }) => assignment.id))];
    const rows = designation.assignments
      .filter((a) => targetIds.includes(a.id))
      .flatMap((a) => a.assignmentsParticipants.map((ap) => ({ assignmentId: a.id, participantId: ap.participantId })));

    await this.prisma.$transaction([
      this.prisma.assignmentsParticipants.deleteMany({ where: { assignmentId: { in: targetIds } } }),
      // Remove dos pontos não incluídos apenas quem foi movido, sem regravar
      // o agregado inteiro e sobrescrever edições independentes nesses pontos.
      this.prisma.assignmentsParticipants.deleteMany({
        where: {
          participantId: { in: rows.map((r) => r.participantId) },
          assignmentId: { notIn: targetIds },
          assignment: { designationsId: designation.id },
        },
      }),
      this.prisma.assignmentsParticipants.createMany({ data: rows }),
      this.prisma.designations.update({ where: { id: designation.id }, data: { updatedAt: designation.updatedAt } }),
    ]);
    const view = toDesignationView(designation);
    return dto.filter ? filterDesignationAssignments(view, dto.filter) : view;
  }

  // ------------------------------------------------------------------------------------
  // POST /designations/:id/send
  // ------------------------------------------------------------------------------------

  /**
   * Port de `sendDesignations.handler` + `SendAssignmentDesignation`.
   *
   * A ordem importa e foi mantida da legacy: primeiro a validação, DEPOIS o
   * status. Invertido, uma designação já enviada voltaria a dar "Não pode haver
   * participantes sem atribuição" em vez de "pois está em andamento".
   *
   * Diferença consciente: a legacy terminava publicando o agregado na fila FIFO,
   * cujo consumidor reescrevia status/mandatoryPresence. Aqui isso é escrito
   * direto — mesmo efeito, sem a corrida e sem a latência. A fila continua
   * existindo na legacy, com seus próprios produtores e consumidores intactos.
   */
  async send(designationId: string, dto: SendDesignationDto): Promise<DesignationView> {
    const designation = await this.load(designationId);
    const view = toDesignationView(designation);

    this.assertEveryoneAssigned(view);
    if (designation.status !== DesignationStatus.OPEN) {
      throw new BadRequestException(`Designação não pode ser enviada, pois está ${DESIGNATION_STATUS_PT_BR[designation.status]}`);
    }

    // "sem destinatário" não é erro: a legacy simplesmente não avisa ninguém e
    // ainda assim marca a designação como enviada.
    const recipients = this.recipientsOf(view);
    if (recipients.length > 0) {
      const frontendUrl = process.env.FRONTEND_URL || 'https://app.tpedigital.com.br';
      const apiUrl = process.env.API_URL || 'https://api.tpedigital.com.br/dev';

      // O link "MINHA" continua apontando para a legacy (`/public/start/:id`).
      const generalLink = await this.shortLinks.shorten(`${frontendUrl}/designacao/${designation.id}`);
      const myLink = await this.shortLinks.shorten(`${apiUrl}/public/start/${designation.id}`);

      const message = this.messages.generate(MessageType.INVITATION_GROUP_TEXT, {
        recipientName: 'Equipe',
        details: `${WEEKDAY_PT_BR[designation.group.configWeekday]}, das *${designation.group.configStartHour} às ${designation.group.configEndHour}*`,
        generalLink,
        loginLink: myLink,
      });

      for (const phone of recipients) {
        await this.sqs.dispatch({
          phone,
          message,
          type: 'text',
          title: `${designation.group.name} - Designação`,
          footer: 'TPE Digital',
        });
      }
    }

    // `optional` só é aplicado quando vem boolean — a legacy checava
    // `body?.optional !== undefined && typeof body.optional === 'boolean'`.
    const optionalIsBoolean = typeof dto?.optional === 'boolean';
    await this.prisma.designations.update({
      where: { id: designation.id },
      data: {
        status: DesignationStatus.IN_PROGRESS,
        ...(optionalIsBoolean && { mandatoryPresence: !dto.optional }),
        updatedAt: new Date(),
      },
    });

    return this.view(designationId);
  }

  /**
   * `ParticipantsNotAssignment`: só capitão, assistente e grupo especial podem
   * ficar sem ponto.
   *
   * Os `profile` que a legacy comparava com COORDINATOR / ASSISTANT_COORDINATOR /
   * ADMIN_ANALYST não existem em `ParticipantGroupProfile` (aqui é sempre o cargo
   * no grupo) — eram comparações mortas, omitidas.
   */
  private assertEveryoneAssigned(view: DesignationView) {
    if (view.group.type === GroupType.SPECIAL) return;
    for (const participant of view.participants) {
      if (participant.profile === ParticipantGroupProfile.CAPTAIN) continue;
      if (participant.profile === ParticipantGroupProfile.ASSISTANT_CAPTAIN) continue;
      throw new BadRequestException('Não pode haver participantes sem atribuição');
    }
  }

  /**
   * `captainsAndCoordinators`: quem recebe o aviso quando o grupo não tem
   * WhatsApp configurado. Na prática é o capitão (o perfil COORDINATOR da legacy
   * também era comparação morta), escalado ou não, com telefone único.
   */
  private recipientsOf(view: DesignationView): string[] {
    if (view.group.whatsappId) return [view.group.whatsappId];

    const isCaptain = (p: DesignationViewParticipant) => p.profile === ParticipantGroupProfile.CAPTAIN;
    const everyone = [...view.participants, ...view.assignments.flatMap((a) => a.participants)];
    return [
      ...new Set(
        everyone
          .filter(isCaptain)
          .map((p) => p.phone)
          .filter((phone) => !!phone),
      ),
    ];
  }

  // ------------------------------------------------------------------------------------
  // ?random — sorteio da escala (Fase 5)
  // ------------------------------------------------------------------------------------

  /**
   * Port de `weekDesignationsByGroupId.handler` no caminho `?random` +
   * `Designation.generateAssignment()` + `isSameAsPreviousDesignation`.
   *
   * Na legacy esse GET escrevia: sorteava a escala e publicava o agregado na
   * fila FIFO, cujo consumidor fazia o `deleteMany`/`createMany`. Aqui o sorteio
   * é pura função (`random-assignment.ts`) e a gravação é direta.
   *
   * Fica num método de escrita, e não no `DesignationViewService`, porque grava
   * mesmo sendo disparado por um GET — mesma viagem da rota de leitura que já
   * respondia `?random` no front.
   */
  async randomize(groupId: string, filter?: string): Promise<DesignationView> {
    const designation = await this.prisma.designations.findFirst({
      where: { groupId, status: { not: DesignationStatus.ARCHIVED } },
      include: designationViewInclude,
    });
    if (!designation) throw new NotFoundException('Designação não encontrada');

    const view = toDesignationView(designation);

    // tenta não repetir a escala da última designação arquivada (até 20x, como a legacy)
    const previous = await this.viewService.previousArchivedDesignation(groupId).catch(() => null);
    generateRandomAssignment(view, (s) => DESIGNATION_STATUS_PT_BR[s]);
    let retryCount = 0;
    while (previous && isSameAsPreviousDesignation(view, previous) && retryCount < 20) {
      generateRandomAssignment(view, (s) => DESIGNATION_STATUS_PT_BR[s]);
      retryCount++;
    }

    // persiste: substitui as linhas de `assignments_participants` das linhas
    // de assignment desta designação — mesmo efeito do consumidor da fila
    await this.prisma.$transaction([
      this.prisma.assignmentsParticipants.deleteMany({
        where: { assignment: { designationsId: designation.id } },
      }),
      this.prisma.assignmentsParticipants.createMany({
        data: view.assignments.flatMap((a) => a.participants.map((p) => ({ assignmentId: a.id, participantId: p.id }))),
      }),
      this.prisma.designations.update({ where: { id: designation.id }, data: { updatedAt: new Date() } }),
    ]);

    const saved = await this.view(designation.id);
    return filter ? filterDesignationAssignments(saved, filter) : saved;
  }

  // ------------------------------------------------------------------------------------
  // helpers
  // ------------------------------------------------------------------------------------

  private async load(designationId: string): Promise<DesignationModel> {
    const designation = await this.prisma.designations.findUnique({
      where: { id: designationId },
      include: designationViewInclude,
    });
    if (!designation) throw new NotFoundException('Designação não encontrada');
    return designation;
  }

  private async view(designationId: string): Promise<DesignationView> {
    return toDesignationView(await this.load(designationId));
  }

  /** Só designação ABERTA ou EM ANDAMENTO aceita mexer nos pontos. */
  private assertEditable(designation: { status: DesignationStatus }) {
    if (designation.status !== DesignationStatus.OPEN && designation.status !== DesignationStatus.IN_PROGRESS) {
      throw new ForbiddenException(`Designação não pode ser enviada, pois está ${DESIGNATION_STATUS_PT_BR[designation.status]}`);
    }
  }
}

/**
 * Reflete no modelo já carregado o resultado de `updateParticipants`, para a
 * resposta sair sem consultar o banco de novo.
 *
 * Escreve exatamente o que a transação acabou de gravar: o ponto de destino fica
 * com `finalIds` e os demais perdem quem foi para lá. O objeto de participante
 * é reaproveitado do que já estava no modelo (todo mundo no `pool` veio de
 * `group.participantsGroup` ou de outro ponto, então já está carregado).
 */
function applyToModel(designation: DesignationModel, targetAssignmentId: string, finalIds: Set<string>) {
  // Quem já estava escalado vem com `participantsGroup` completo (o include pede
  // `participantsGroup: true`). Quem entra agora estava na lista de disponíveis,
  // onde o include traz o cargo no ROW do grupo, não dentro do participante — então
  // a linha é montada aqui. Equivale ao que o banco devolveria: o mapper só usa
  // `participantsGroup.find(pg => pg.groupId === designation.groupId)`.
  const escalados = new Map(designation.assignments.flatMap((a) => a.assignmentsParticipants).map((ap) => [ap.participantId, ap.participant] as const));

  for (const assignment of designation.assignments) {
    if (assignment.id === targetAssignmentId) {
      const novas: DesignationModel['assignments'][number]['assignmentsParticipants'] = [];
      for (const participantId of finalIds) {
        const escalado = escalados.get(participantId);
        const row = designation.group.participantsGroup.find((pg) => pg.participantId === participantId);
        if (!escalado && !row) continue;

        novas.push({
          // `id` e `assignmentId` são exigidos pelo tipo da tabela, mas o mapper
          // só lê `participant` — e o `id` real só existe depois do insert.
          id: '',
          assignmentId: targetAssignmentId,
          participantId,
          participant: escalado ?? {
            ...row!.participant,
            participantsGroup: [
              {
                id: row!.id,
                groupId: designation.groupId,
                participantId,
                profile: row!.profile,
              },
            ],
          },
        });
      }
      assignment.assignmentsParticipants = novas;
      continue;
    }
    assignment.assignmentsParticipants = assignment.assignmentsParticipants.filter((ap) => !finalIds.has(ap.participantId));
  }
  designation.updatedAt = new Date();
}
