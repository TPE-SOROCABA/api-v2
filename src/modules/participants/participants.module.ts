import { Module } from '@nestjs/common';
import { ParticipantsService } from './participants.service';
import { ParticipantsController } from './participants.controller';
import { S3Service } from 'src/infra/s3.service';

@Module({
  controllers: [ParticipantsController],
  providers: [ParticipantsService, S3Service],
})
export class ParticipantsModule {}
