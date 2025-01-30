import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { CreateParticipantDto } from './dto/create-participant.dto';
import { UpdateParticipantDto } from './dto/update-participant.dto';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { TransactionLogger } from 'src/infra/transaction.logger';

@Injectable()
export class ParticipantsService {
  logger = new TransactionLogger(ParticipantsService.name);
  constructor(private prisma: PrismaService) { }

  create(createParticipantDto: CreateParticipantDto) {
    this.logger.log(`Criando participante `, createParticipantDto.name);
    return this.prisma.participants.create({
      data: createParticipantDto,
    });
  }

  findAll() {
    this.logger.log('Buscando todos os participantes', { teste: 'teste' });
    return this.prisma.participants.findMany({
      include: {
        petitions: true,
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

  update(id: string, updateParticipantDto: UpdateParticipantDto) {
    return this.prisma.participants.update({
      where: { id },
      data: updateParticipantDto,
    });
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
