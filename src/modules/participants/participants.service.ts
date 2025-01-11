import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateParticipantDto } from './dto/create-participant.dto';
import { UpdateParticipantDto } from './dto/update-participant.dto';
import { PrismaService } from 'src/infra/prisma.service';

@Injectable()
export class ParticipantsService {

  constructor(private prisma: PrismaService) { }

  create(createParticipantDto: CreateParticipantDto) {
    return this.prisma.participants.create({
      data: createParticipantDto,
    });
  }

  findAll() {
    return this.prisma.participants.findMany();
  }

  async findOne(id: string) {
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
