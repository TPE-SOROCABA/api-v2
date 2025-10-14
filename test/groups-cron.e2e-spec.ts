import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { GroupsService } from '../src/modules/groups/groups.service';

describe('Groups Cron Integration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let groupsService: GroupsService;
  
  // IDs para cleanup
  let createdParticipantIds: string[] = [];
  let createdGroupId: string;
  let createdDesignationIds: string[] = [];
  let createdPointIds: string[] = [];
  let createdCartIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    
    prisma = app.get<PrismaService>(PrismaService);
    groupsService = app.get<GroupsService>(GroupsService);
  });

  afterAll(async () => {
    // Cleanup - remover todos os dados de teste criados
    await cleanupTestData();
    await app.close();
  });

  describe('handleCron - Create designations for groups without them', () => {
    it('should create designations, points, carts and assignments for groups with participants but no designations', async () => {
      // 1. Criar 2 participantes de teste
      const participant1 = await prisma.participants.create({
        data: {
          name: 'Teste Participante 1',
          phone: `+55119${Math.random().toString().substr(2, 8)}`,
          email: `teste1.${Date.now()}@example.com`,
          sex: 'MALE',
          profile: 'PARTICIPANT'
        }
      });
      createdParticipantIds.push(participant1.id);

      const participant2 = await prisma.participants.create({
        data: {
          name: 'Teste Participante 2',
          phone: `+55119${Math.random().toString().substr(2, 8)}`,
          email: `teste2.${Date.now()}@example.com`,
          sex: 'FEMALE',
          profile: 'PARTICIPANT'
        }
      });
      createdParticipantIds.push(participant2.id);

      // 2. Criar um grupo de teste
      const group = await prisma.groups.create({
        data: {
          name: 'Grupo Teste Cron',
          configEndHour: '18:00',
          configMax: 4,
          configMin: 2,
          configStartHour: '14:00',
          configWeekday: 'SATURDAY',
          status: 'OPEN',
          type: 'MAIN'
        }
      });
      createdGroupId = group.id;

      // 3. Associar participantes ao grupo
      await prisma.participantsGroups.create({
        data: {
          participantId: participant1.id,
          groupId: group.id,
          profile: 'PARTICIPANT'
        }
      });

      await prisma.participantsGroups.create({
        data: {
          participantId: participant2.id,
          groupId: group.id,
          profile: 'CAPTAIN'
        }
      });

      // 4. Verificar estado inicial - grupo deve ter participantes mas nenhuma designação
      const groupBefore = await prisma.groups.findUnique({
        where: { id: group.id },
        include: {
          participantsGroup: true,
          designations: true
        }
      });

      expect(groupBefore?.participantsGroup).toHaveLength(2);
      expect(groupBefore?.designations).toHaveLength(0);

      // 5. Executar a cron diretamente no grupo criado
      await groupsService.createDesignationForGroup(groupBefore);

      // 6. Verificar se a designação foi criada
      const groupAfter = await prisma.groups.findUnique({
        where: { id: group.id },
        include: {
          participantsGroup: true,
          designations: {
            include: {
              assignments: {
                include: {
                  point: true,
                  assignmentsPublicationCart: {
                    include: {
                      publicationCart: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      // Verificações da designação
      expect(groupAfter?.designations).toHaveLength(1);
      const designation = groupAfter!.designations[0];
      expect(designation.name).toBe(`Designação Automática - ${group.name}`);
      expect(designation.status).toBe('OPEN');
      expect(designation.mandatoryPresence).toBe(true);
      createdDesignationIds.push(designation.id);

      // Verificações dos assignments
      expect(designation.assignments).toHaveLength(10);
      
      // Coletar IDs para cleanup
      designation.assignments.forEach(assignment => {
        createdPointIds.push(assignment.point.id);
        assignment.assignmentsPublicationCart.forEach(apc => {
          createdCartIds.push(apc.publicationCart.id);
        });
      });

      // 7. Verificar se pontos foram criados corretamente
      const points = await prisma.point.findMany({
        where: {
          id: { in: createdPointIds }
        }
      });
      expect(points).toHaveLength(10);
      
      // Verificar nomes dos pontos
      for (let i = 1; i <= 10; i++) {
        const point = points.find(p => p.name === `Ponto ${i} - ${group.name}`);
        expect(point).toBeDefined();
      }

      // 8. Verificar se carrinhos foram criados corretamente
      const carts = await prisma.publicationCart.findMany({
        where: {
          id: { in: createdCartIds }
        }
      });
      expect(carts).toHaveLength(10);
      
      // Verificar nomes dos carrinhos
      for (let i = 1; i <= 10; i++) {
        const cart = carts.find(c => c.name === `Carrinho ${i} - ${group.name}`);
        expect(cart).toBeDefined();
        expect(cart?.description).toBe(`Carrinho genérico ${i} para o grupo ${group.name}`);
      }

      // 9. Verificar associações ponto-carrinho-grupo
      const pointCartAssociations = await prisma.pointPublicationCart.findMany({
        where: {
          groupId: group.id
        }
      });
      expect(pointCartAssociations).toHaveLength(10);
      
      pointCartAssociations.forEach(association => {
        expect(association.minParticipants).toBe(group.configMin);
        expect(association.maxParticipants).toBe(group.configMax);
        expect(association.status).toBe(true);
      });

      // 10. Verificar se assignments têm configurações corretas
      designation.assignments.forEach(assignment => {
        expect(assignment.config_min).toBe(group.configMin);
        expect(assignment.config_max).toBe(group.configMax);
        expect(assignment.config_status).toBe(true);
        expect(assignment.designationsId).toBe(designation.id);
      });

      console.log('✅ Teste concluído com sucesso!');
      console.log(`📊 Criados: ${createdPointIds.length} pontos, ${createdCartIds.length} carrinhos, 1 designação`);
    }, 30000); // 30 segundos de timeout

    it('should not create designations for groups that already have designations', async () => {
      // Criar grupo com designação
      const groupWithDesignation = await prisma.groups.create({
        data: {
          name: 'Grupo Com Designação',
          configEndHour: '18:00',
          configMax: 4,
          configMin: 2,
          configStartHour: '14:00',
          configWeekday: 'SUNDAY',
          status: 'OPEN',
          type: 'MAIN'
        }
      });

      // Criar participante para o grupo
      const participant = await prisma.participants.create({
        data: {
          name: 'Teste Participante Grupo Com Designação',
          phone: `+55119${Math.random().toString().substr(2, 8)}`,
          email: `teste.grupo.${Date.now()}@example.com`,
          sex: 'MALE',
          profile: 'PARTICIPANT'
        }
      });

      // Associar participante ao grupo
      await prisma.participantsGroups.create({
        data: {
          participantId: participant.id,
          groupId: groupWithDesignation.id,
          profile: 'PARTICIPANT'
        }
      });

      // Criar designação para o grupo
      await prisma.designations.create({
        data: {
          groupId: groupWithDesignation.id,
          name: 'Designação Existente',
          status: 'OPEN',
          mandatoryPresence: true,
          designationDate: new Date(),
          designationEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      });

      // Contar designações antes
      const designationsBefore = await prisma.designations.count({
        where: { groupId: groupWithDesignation.id }
      });
      
      // Executar cron
      await groupsService.handleCron();
      
      // Contar designações depois
      const designationsAfter = await prisma.designations.count({
        where: { groupId: groupWithDesignation.id }
      });
      
      // Não deve ter criado novas designações
      expect(designationsAfter).toBe(designationsBefore);

      // Cleanup
      await prisma.designations.deleteMany({ where: { groupId: groupWithDesignation.id } });
      await prisma.participantsGroups.deleteMany({ where: { groupId: groupWithDesignation.id } });
      await prisma.participants.delete({ where: { id: participant.id } });
      await prisma.groups.delete({ where: { id: groupWithDesignation.id } });
    }, 15000);

    it('should not create designations for groups without participants', async () => {
      // Criar grupo sem participantes
      const emptyGroup = await prisma.groups.create({
        data: {
          name: 'Grupo Vazio Teste',
          configEndHour: '18:00',
          configMax: 4,
          configMin: 2,
          configStartHour: '14:00',
          configWeekday: 'SUNDAY',
          status: 'OPEN',
          type: 'MAIN'
        }
      });

      // Contar designações antes
      const designationsBefore = await prisma.designations.count();
      
      // Executar cron
      await groupsService.handleCron();
      
      // Contar designações depois
      const designationsAfter = await prisma.designations.count();
      
      // Não deve ter criado novas designações
      expect(designationsAfter).toBe(designationsBefore);

      // Cleanup do grupo vazio
      await prisma.groups.delete({ where: { id: emptyGroup.id } });
    }, 15000);
  });

  async function cleanupTestData() {
    try {
      console.log('🧹 Iniciando cleanup dos dados de teste...');

      // 1. Remover assignments_publication_carts
      if (createdDesignationIds.length > 0) {
        const assignments = await prisma.assignments.findMany({
          where: { designationsId: { in: createdDesignationIds } }
        });
        
        for (const assignment of assignments) {
          await prisma.assignmentsPublicationCart.deleteMany({
            where: { assignmentId: assignment.id }
          });
        }
      }

      // 2. Remover assignments
      if (createdDesignationIds.length > 0) {
        await prisma.assignments.deleteMany({
          where: { designationsId: { in: createdDesignationIds } }
        });
      }

      // 3. Remover designações
      if (createdDesignationIds.length > 0) {
        await prisma.designations.deleteMany({
          where: { id: { in: createdDesignationIds } }
        });
      }

      // 4. Remover point_publication_carts
      if (createdGroupId) {
        await prisma.pointPublicationCart.deleteMany({
          where: { groupId: createdGroupId }
        });
      }

      // 5. Remover pontos
      if (createdPointIds.length > 0) {
        await prisma.point.deleteMany({
          where: { id: { in: createdPointIds } }
        });
      }

      // 6. Remover carrinhos
      if (createdCartIds.length > 0) {
        await prisma.publicationCart.deleteMany({
          where: { id: { in: createdCartIds } }
        });
      }

      // 7. Remover participantes dos grupos
      if (createdGroupId) {
        await prisma.participantsGroups.deleteMany({
          where: { groupId: createdGroupId }
        });
      }

      // 8. Remover grupo
      if (createdGroupId) {
        await prisma.groups.delete({
          where: { id: createdGroupId }
        });
      }

      // 9. Remover participantes
      if (createdParticipantIds.length > 0) {
        await prisma.participants.deleteMany({
          where: { id: { in: createdParticipantIds } }
        });
      }

      console.log('✅ Cleanup concluído com sucesso!');
    } catch (error) {
      console.error('❌ Erro durante cleanup:', error);
    }
  }
});