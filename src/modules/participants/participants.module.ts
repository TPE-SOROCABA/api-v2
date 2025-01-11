import { Module } from '@nestjs/common';
import { ParticipantsService } from './participants.service';
import { ParticipantsController } from './participants.controller';
import { PrismaService } from 'src/infra/prisma.service';

@Module({
  controllers: [ParticipantsController],
  providers: [ParticipantsService, PrismaService],
})
export class ParticipantsModule {}
