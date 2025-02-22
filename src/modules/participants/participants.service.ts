import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { CreateParticipantDto } from './dto/create-participant.dto';
import { UpdateParticipantDto } from './dto/update-participant.dto';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { TransactionLogger } from 'src/infra/transaction.logger';
import { Participant } from './entities/participants.entity';
import { ParticipantProfile, PetitionStatus } from '@prisma/client';
import { S3Service } from 'src/infra/s3.service';
import * as fs from 'fs';

@Injectable()
export class ParticipantsService {
  logger = new TransactionLogger(ParticipantsService.name);
  constructor(private prisma: PrismaService, private readonly s3Service: S3Service) { }

  async create(createParticipantDto: CreateParticipantDto) {
    const participant = Participant.build(createParticipantDto);
    this.logger.log(`Criando participante `, createParticipantDto.name);
    try {
      return await this.prisma.$transaction([
        this.prisma.participants.create({
          data: createParticipantDto,
        }),
        this.prisma.petitions.update({
          where: { id: createParticipantDto.petitionId },
          data: { status: participant.registrationStatus, name: createParticipantDto.name },
        })
      ]);
    } catch (error) {
      this.logger.error(`Erro ao criar participante: ${error}`);
      throw error
    }
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
    await this.prisma.petitions.updateMany({
      where: {
        id: participant?.petitionId || updateParticipantDto?.petitionId,
        status: {
          in: [PetitionStatus.CREATED, PetitionStatus.WAITING, PetitionStatus.WAITING_INFORMATION]
        }
      },
      data: { status: participant.registrationStatus, name: participant.name },
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

  async toggleAdminAnalyst(userId: string) {
    console.log('userId', userId);
    const participant = await this.prisma.participants.findUnique({
      where: { id: userId },
    });

    if (!participant) {
      throw new NotFoundException('Participante não encontrado');
    }

    const profile = participant.profile === ParticipantProfile.COORDINATOR ? ParticipantProfile.ADMIN_ANALYST : ParticipantProfile.COORDINATOR;
    this.logger.log(`Alterando perfil do participante: ${userId} para ${profile}`);
    return this.prisma.participants.update({
      where: { id: userId },
      data: { profile },
    });
  }

  async uploadPhoto(id: string, file: Express.Multer.File) {
    this.logger.log(`Buscando participante: ${id}`);
    const participant = await this.prisma.participants.findUnique({
      where: { id },
    });
    if (participant.profilePhoto) {
      try {
        const key = participant.profilePhoto.split('/').pop();
        await this.s3Service.deleteFile(key, `${process.env.NODE_ENV}-petitions`);
        this.logger.log(`Foto antiga excluída: ${key}`);
      } catch (error) {
        this.logger.error(`Erro ao excluir a foto antiga: ${error}`);
      }
    }

    this.logger.log(`Iniciando upload do arquivo: ${file.originalname}`);
    const image = fs.readFileSync(file.path);

    this.logger.log(`Fazendo upload da imagem para o bucket S3...`);
    const imageUrl = await this.s3Service.uploadFile({
      ...file,
      buffer: image,
      mimetype: file.mimetype,
      size: image.length,
      originalname: file.originalname.replace('.pdf', '.png').replace(/ /g, '_'),
    }, `${process.env.NODE_ENV}-petitions`); // depois mudar para participants-photo
    this.logger.log(`Upload concluído. URL da imagem: ${imageUrl}`);
    fs.unlinkSync(file.path);
    this.logger.log(`Imagem temporária excluída: ${file.path}`);
    this.logger.log(`Atualizando participante: ${id} com a URL da imagem`);
    return this.prisma.participants.update({
      where: { id },
      data: { profilePhoto: imageUrl },
    });
  }
}
