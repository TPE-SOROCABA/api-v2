import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Put,
} from '@nestjs/common';
import { GroupsParticipantsService } from './groups-participants.service';
import { UpdateGroupParticipanteProfileDto } from './dto/update-group-participante-profile.dto';

@Controller('groups')
export class GroupsParticipantsController {
    constructor(private readonly groupsParticipantsService: GroupsParticipantsService) { }

    @Get(':groupId/participants')
    findAllParticipants(@Param('groupId') groupId: string) {
        return this.groupsParticipantsService.findAllParticipants(groupId);
    }

    @Patch(':groupId/participants/:participantId')
    updateParticipantGroup(@Param('groupId') groupId: string, @Param('participantId') participantId: string) {
        return this.groupsParticipantsService.updateParticipantGroup(groupId, participantId);
    }

    @Delete(':groupId/participants/:participantId')
    removeParticipantGroup(@Param('groupId') groupId: string, @Param('participantId') participantId: string) {
        return this.groupsParticipantsService.removeParticipantGroup(groupId, participantId);
    }

    @Put(':groupId/participants/:participantId')
    updateParticipantGroupProfile(@Param('groupId') groupId: string, @Param('participantId') participantId: string, @Body() body: UpdateGroupParticipanteProfileDto) {
        return this.groupsParticipantsService.updateParticipantGroupProfile(groupId, participantId, body);

    }

}
