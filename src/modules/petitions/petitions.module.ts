import { Module } from '@nestjs/common';
import { ConvertPdfToImagesUseCase } from './convert-pdf-to-images.usecase';
import { PetitionsController } from './petitions.controller';
import { PetitionsService } from './petitions.service';
import { S3Service } from 'src/infra/s3.service';
import { OcrService } from 'src/infra/ocr.service';


@Module({
  providers: [ConvertPdfToImagesUseCase, PetitionsService, S3Service, OcrService],
  controllers: [PetitionsController]
})
export class PetitionsModule { }
