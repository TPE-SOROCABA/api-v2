import { Module } from '@nestjs/common';
import { ParticipantsService } from './participants.service';
import { ParticipantsController } from './participants.controller';
import { FirebaseService } from 'src/infra/firebase.service';

@Module({
  controllers: [ParticipantsController],
  providers: [ParticipantsService, FirebaseService],
})
export class ParticipantsModule { }
