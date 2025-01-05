import { Module } from '@nestjs/common';
import { ConvertPdfToImagesUseCase } from './convert-pdf-to-images.usecase';
import { PetitionController } from './petition.controller';
import { PetitionService } from './petition.service';
import { S3Service } from 'src/infra/s3.service';

@Module({
  providers: [ConvertPdfToImagesUseCase, PetitionService, S3Service],
  controllers: [PetitionController]
})
export class PetitionModule {}
