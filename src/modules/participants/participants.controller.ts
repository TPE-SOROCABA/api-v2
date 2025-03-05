import { Controller, Get, Post, Body, Put, Param, Patch, UseInterceptors, UploadedFile, Query } from '@nestjs/common';
import { ParticipantsService } from './participants.service';
import { CreateParticipantDto } from './dto/create-participant.dto';
import { UpdateParticipantDto } from './dto/update-participant.dto';
import { FindOneParams } from 'src/shared/dto/find-one-params.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'node:path';
import { FindAllParticipantParams } from './dto/find-all-participants.params';

@Controller('participants')
export class ParticipantsController {
  constructor(private readonly participantsService: ParticipantsService) { }

  @Post()
  create(@Body() createParticipantDto: CreateParticipantDto) {
    return this.participantsService.create(createParticipantDto);
  }

  @Get()
  findAll(@Query() params: FindAllParticipantParams) {
    return this.participantsService.findAll(params);
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

  @Post(':id/photo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './photo', // Pasta para salvar o PDF recebido
        filename: (req, file, callback) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const fileExtName = extname(file.originalname);
          callback(null, `${uniqueSuffix}${fileExtName}`);
        },
      }),
    }),
  )
  uploadPhoto(@Param() params: FindOneParams, @UploadedFile() file: Express.Multer.File) {
    return this.participantsService.uploadPhoto(params.id, file);
  }
}
