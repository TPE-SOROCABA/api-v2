import { Module } from '@nestjs/common';

import { PrismaModule } from 'src/infra/prisma/prisma.module';
import { DesignationsController } from './designations.controller';
import { DesignationsService } from './designations.service';
import { DesignationViewService } from './designation-view.service';
import { DesignationWriteService } from './designation-write.service';
import { GroupsDesignationsController } from './groups-designations.controller';
import { ParticipantSelfService } from './participant-self.service';

@Module({
  imports: [PrismaModule],
  controllers: [DesignationsController, GroupsDesignationsController],
  providers: [DesignationsService, DesignationViewService, DesignationWriteService, ParticipantSelfService],
  exports: [DesignationsService, DesignationViewService],
})
export class DesignationsModule {}
