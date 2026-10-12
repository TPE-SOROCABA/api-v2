import { Body, Controller, Delete, Get, Param, Post, Query, Request } from '@nestjs/common';
import { AuthenticatedRequest } from 'src/shared/types';
import { CreateChangeRequestDto, FindChangeRequestsParams } from './dto/group-change-requests.dto';
import { GroupChangeRequestsService } from './group-change-requests.service';

/**
 * "Quer trocar de grupo". Sem @Roles: quem pode o quê é decidido no service pelo GroupScopeService
 * (coordenador/analista em qualquer grupo; capitão/assistente só nos grupos onde ele é capitão).
 */
@Controller('group-change-requests')
export class GroupChangeRequestsController {
  constructor(private readonly service: GroupChangeRequestsService) {}

  @Post()
  create(@Request() req: AuthenticatedRequest, @Body() body: CreateChangeRequestDto) {
    return this.service.create(body, req.user);
  }

  @Get()
  findAll(@Request() req: AuthenticatedRequest, @Query() query: FindChangeRequestsParams) {
    return this.service.findAll(query, req.user);
  }

  @Delete(':id')
  cancel(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.cancel(id, req.user);
  }
}
