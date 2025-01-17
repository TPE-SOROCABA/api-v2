import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { CreateParticipantDto } from './dto/create-participant.dto';
import { UpdateParticipantDto } from './dto/update-participant.dto';
import { PrismaService } from 'src/infra/prisma.service';
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
    this.logger.log('Buscando todos os participantes', {teste: 'teste'});
    return this.prisma.participants.findMany();
  }

  async findOne(id: string) {
    this.logger.log(`Buscando participante: ${id}`);
    const participant = await this.prisma.participants.findUnique({
      where: { id },
      include: {
        Petitions: true,
      },
    });

    if (!participant) {
      throw new NotFoundException('Participante não encontrado');
    }

    const { Petitions, ...rest } = participant;
    return {
      ...rest,
      petitions: Petitions,
    };
  }

  update(id: string, updateParticipantDto: UpdateParticipantDto) {
    return this.prisma.participants.update({
      where: { id },
      data: updateParticipantDto,
    });
  }
}
