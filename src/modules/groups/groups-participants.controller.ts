import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Put,
    Request,
} from '@nestjs/common';
import { GroupsParticipantsService } from './groups-participants.service';
import { UpdateGroupParticipanteProfileDto } from './dto/update-group-participante-profile.dto';
import { TransferParticipantDto } from './dto/transfer-participant.dto';
import { AuthenticatedRequest } from 'src/shared/types';
import { Roles } from 'src/shared/roles.decorator';

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

    // Troca de grupo atômica: :groupId é o grupo de DESTINO; body.fromGroupId é o de origem
    @Roles('COORDINATOR', 'ADMIN_ANALYST')
    @Post(':groupId/participants/:participantId/transfer')
    transferParticipant(@Request() req: AuthenticatedRequest, @Param('groupId') groupId: string, @Param('participantId') participantId: string, @Body() body: TransferParticipantDto) {
        return this.groupsParticipantsService.transferParticipant(body.fromGroupId, groupId, participantId, req.user);
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
