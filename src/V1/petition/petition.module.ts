import { Module } from '@nestjs/common';
import { ConvertPdfToImagesUseCase } from './convert-pdf-to-images.usecase';
import { PetitionController } from './petition.controller';

@Module({
  providers: [ConvertPdfToImagesUseCase],
  controllers: [PetitionController]
})
export class PetitionModule {}
