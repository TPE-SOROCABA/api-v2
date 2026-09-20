import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Put,
    Request,
} from '@nestjs/common';
import { GroupsParticipantsService } from './groups-participants.service';
import { UpdateGroupParticipanteProfileDto } from './dto/update-group-participante-profile.dto';
import { AuthenticatedRequest } from 'src/shared/types';

@Controller('groups')
export class GroupsParticipantsController {
    constructor(private readonly groupsParticipantsService: GroupsParticipantsService) { }

    @Get(':groupId/participants')
    findAllParticipants(@Param('groupId') groupId: string) {
        return this.groupsParticipantsService.findAllParticipants(groupId);
    }

    @Patch(':groupId/participants/:participantId')
    updateParticipantGroup(@Request() req: AuthenticatedRequest, @Param('groupId') groupId: string, @Param('participantId') participantId: string) {
        return this.groupsParticipantsService.updateParticipantGroup(groupId, participantId, req.user);
    }

    @Delete(':groupId/participants/:participantId')
    removeParticipantGroup(@Request() req: AuthenticatedRequest, @Param('groupId') groupId: string, @Param('participantId') participantId: string) {
        return this.groupsParticipantsService.removeParticipantGroup(groupId, participantId, req.user);
    }

    @Put(':groupId/participants/:participantId')
    updateParticipantGroupProfile(@Request() req: AuthenticatedRequest, @Param('groupId') groupId: string, @Param('participantId') participantId: string, @Body() body: UpdateGroupParticipanteProfileDto) {
        return this.groupsParticipantsService.updateParticipantGroupProfile(groupId, participantId, body, req.user);

    }

}
