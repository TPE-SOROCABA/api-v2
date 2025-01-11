import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
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

  @Patch(':id')
  update(@Param() params: FindOneParams, @Body() updateParticipantDto: UpdateParticipantDto) {
    return this.participantsService.update(params.id, updateParticipantDto);
  }
}
