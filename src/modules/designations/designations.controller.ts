import { Body, Controller, Delete, Get, Param, Post, Patch, Put, Query, UseGuards, HttpCode, HttpStatus, UsePipes, ValidationPipe } from '@nestjs/common';
import { DesignationsService } from './designations.service';
import { DesignationViewService } from './designation-view.service';
import { DesignationWriteService } from './designation-write.service';
import { FindOneDesignationParams } from './dto/find-one-params.dto';
import {
  CancelDesignationDto,
  CreateDesignationQuery,
  SendDesignationDto,
  UpdateManyPointsDto,
  UpdateMandatoryPresenceDto,
  UpdatePointParticipantsDto,
  UpdatePointStatusDto,
} from './dto/designation-write.dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { Public } from 'src/auth/public.decorator';
import { Roles } from 'src/shared/roles.decorator';

@Controller('designations')
@UseGuards(AuthGuard)
export class DesignationsController {
  constructor(
    private readonly designationsService: DesignationsService,
    private readonly view: DesignationViewService,
    private readonly write: DesignationWriteService,
  ) {}

  @Get(':id')
  @UsePipes(new ValidationPipe({ transform: true }))
  findOne(@Param() params: FindOneDesignationParams) {
    return this.view.findById(params.id);
  }

  /**
   * Tela pública do voluntário (`/designacao/:id`, aberta pelo link do WhatsApp).
   * Sem token na legacy, e sem token aqui — exigir quebraria o autoatendimento.
   */
  @Public()
  @Get(':id/participants')
  @UsePipes(new ValidationPipe({ transform: true }))
  participants(@Param() params: FindOneDesignationParams) {
    return this.view.findEventEntries(params.id);
  }

  /** Mesma coisa, já filtrada no voluntário (`/designacao/:id/:participantId`). */
  @Public()
  @Get(':id/participants/:participantId')
  @UsePipes(new ValidationPipe({ transform: true }))
  participantDesignation(@Param() params: FindOneDesignationParams, @Param('participantId') participantId: string) {
    return this.view.findParticipantEventEntry(params.id, participantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true }))
  remove(@Param() params: FindOneDesignationParams) {
    return this.designationsService.remove(params.id);
  }

  // ----------------------------------------------------------------------------------
  // Escrita — portadas de `api/src/functions/designations/*.ts` (Fase 4).
  // Todas respondem o mesmo shape de leitura (`DesignationView`), como na legacy.
  // ----------------------------------------------------------------------------------

  // 200 (e não o 201 padrão do Nest) porque a legacy respondia 200 — `ResponseHandler.success`
  // usa 200 como default e o front já trata o sucesso sem olhar o status.
  @Post()
  @Roles('COORDINATOR')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true }))
  create(@Query() query: CreateDesignationQuery) {
    return this.write.create(query.groupId);
  }

  @Patch(':id/cancel')
  @UsePipes(new ValidationPipe({ transform: true }))
  cancel(@Param() params: FindOneDesignationParams, @Body() dto: CancelDesignationDto) {
    return this.write.cancel(params.id, dto);
  }

  @Patch(':id/reopen')
  @UsePipes(new ValidationPipe({ transform: true }))
  reopen(@Param() params: FindOneDesignationParams) {
    return this.write.reopen(params.id);
  }

  @Patch(':id/points/:pointId')
  @UsePipes(new ValidationPipe({ transform: true }))
  updatePointStatus(@Param() params: FindOneDesignationParams, @Param('pointId') pointId: string, @Body() dto: UpdatePointStatusDto) {
    return this.write.updatePointStatus(params.id, pointId, dto);
  }

  @Patch(':id/optional')
  @UsePipes(new ValidationPipe({ transform: true }))
  setMandatoryPresence(@Param() params: FindOneDesignationParams, @Body() dto: UpdateMandatoryPresenceDto) {
    return this.write.setMandatoryPresence(params.id, dto);
  }

  @Put(':id/points/:pointId/participants')
  @UsePipes(new ValidationPipe({ transform: true }))
  updatePointParticipants(@Param() params: FindOneDesignationParams, @Param('pointId') pointId: string, @Body() dto: UpdatePointParticipantsDto) {
    return this.write.updateParticipants(params.id, pointId, dto);
  }

  @Put(':id/participants')
  @UsePipes(new ValidationPipe({ transform: true }))
  updateManyPoints(@Param() params: FindOneDesignationParams, @Body() dto: UpdateManyPointsDto) {
    return this.write.updateManyParticipants(params.id, dto);
  }

  /** Enfileira o aviso; o consumidor do WhatsApp permanece na legacy. */
  // 200 (e não o 201 padrão do Nest) por causa do `ResponseHandler.success` da legacy.
  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true }))
  send(@Param() params: FindOneDesignationParams, @Body() dto: SendDesignationDto) {
    return this.write.send(params.id, dto);
  }
}
