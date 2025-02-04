import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { CreateParticipantDto } from './dto/create-participant.dto';
import { UpdateParticipantDto } from './dto/update-participant.dto';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { TransactionLogger } from 'src/infra/transaction.logger';
import { Participant } from './entities/participants.entity';

@Injectable()
export class ParticipantsService {
  logger = new TransactionLogger(ParticipantsService.name);
  constructor(private prisma: PrismaService) { }

  create(createParticipantDto: CreateParticipantDto) {
    const participant = Participant.build(createParticipantDto);
    this.logger.log(`Criando participante `, createParticipantDto.name);
    return this.prisma.$transaction([
      this.prisma.participants.create({
        data: createParticipantDto,
      }),
      this.prisma.petitions.update({
        where: { id: createParticipantDto.petitionId },
        data: { status: participant.registrationStatus },
      })
    ]).catch((error) => {
      this.logger.error(`Erro ao criar participante: ${error}`);
      throw new InternalServerErrorException('Erro ao criar participante');  
    });
  }

  findAll() {
    this.logger.log('Buscando todos os participantes');
    return this.prisma.participants.findMany({
      include: {
        petitions: true,
        congregation: true,
      }
    });
  }

  async findOne(id: string) {
    this.logger.log(`Buscando participante: ${id}`);
    const participant = await this.prisma.participants.findUnique({
      where: { id },
      include: {
        petitions: true,
        congregation: true,
      },
    });

    if (!participant) {
      throw new NotFoundException('Participante não encontrado');
    }


    return participant;
  }

  async findByEmail(email: string) {
    this.logger.log(`Buscando participante pelo email: ${email}`);
    const participant = await this.prisma.participants.findFirst({
      where: { email },
      include: {
        petitions: true,
        congregation: true,
      }
    });

    if (!participant) {
      throw new NotFoundException('Participante não encontrado');
    }

    return participant;
  }

  async update(id: string, updateParticipantDto: UpdateParticipantDto) {
    this.logger.log(`Atualizando participante: ${id}`);
    this.prisma.participants.findUnique({ where: { id } });
    const entity = await this.prisma.participants.update({
      where: { id },
      data: updateParticipantDto,
    });
    const participant = Participant.build(entity);
    await this.prisma.petitions.update({
      where: { id: participant.petitionId },
      data: { status: participant.registrationStatus },
    });
    return entity;
  }

  async updateMissingEmails() {
    const participants = await this.prisma.participants.findMany();
    for (const participant of participants) {
      if (!participant.email) {
        const uuid = participant.id;
        const email = `${uuid}@gmail.com`;
        participant.email = email;
        await this.prisma.participants.update({
          where: { id: uuid },
          data: { email },
        });
      }
    }
  }
}
