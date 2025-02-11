import { Controller, Get, Post, Body, Put, Param, Patch } from '@nestjs/common';
import { ParticipantsService } from './participants.service';
import { CreateParticipantDto } from './dto/create-participant.dto';
import { UpdateParticipantDto } from './dto/update-participant.dto';
import { FindOneParams } from 'src/shared/dto/find-one-params.dto';

@Controller('participants')
export class ParticipantsController {
  constructor(private readonly participantsService: ParticipantsService) { }

  @Post()
  create(@Body() createParticipantDto: CreateParticipantDto) {
    return this.participantsService.create(createParticipantDto);
  }

  @Get()
  findAll() {
    return this.participantsService.findAll();
  }

  @Get(':id')
  findOne(@Param() params: FindOneParams) {
    return this.participantsService.findOne(params.id);
  }

  @Put(':id')
  update(@Param() params: FindOneParams, @Body() updateParticipantDto: UpdateParticipantDto) {
    return this.participantsService.update(params.id, updateParticipantDto);
  }

  @Get('emails/:email')
  findByEmail(@Param('email') email: string) {
    return this.participantsService.findByEmail(email);
  }

  // Rota experimental, para ambiente de desenvolvimento
  @Patch('toggle-admin/:userId')
  toggleAdminAnalyst(@Param('userId') userId: string) {
    // depois colocar um middleware para verificar ambiente de desenvolvimento
    return this.participantsService.toggleAdminAnalyst(userId);
  }
}
