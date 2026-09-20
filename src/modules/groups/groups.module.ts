import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { GroupsParticipantsController } from './groups-participants.controller';
import { GroupsParticipantsService } from './groups-participants.service';
import { GroupChangeRequestsModule } from '../group-change-requests/group-change-requests.module';

@Module({
    imports: [GroupChangeRequestsModule],
    controllers: [GroupsController, GroupsParticipantsController],
    providers: [GroupsService, GroupsParticipantsService],
})
export class GroupsModule { }
