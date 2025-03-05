import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { GroupsParticipantsController } from './groups-participants.controller';
import { GroupsParticipantsService } from './groups-participants.service';

@Module({
    controllers: [GroupsController, GroupsParticipantsController],
    providers: [GroupsService, GroupsParticipantsService],
})
export class GroupsModule { }
