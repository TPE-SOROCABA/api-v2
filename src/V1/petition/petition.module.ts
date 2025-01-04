import { Module } from '@nestjs/common';
import { PetitionService } from './petition.service';
import { PetitionController } from './petition.controller';

@Module({
  providers: [PetitionService],
  controllers: [PetitionController]
})
export class PetitionModule {}
