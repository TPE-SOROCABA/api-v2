import { Module } from '@nestjs/common';
import { ConvertPdfToImagesUseCase } from './convert-pdf-to-images.usecase';
import { PetitionsController } from './petitions.controller';
import { PetitionsService } from './petitions.service';
import { OcrService } from 'src/infra/ocr.service';
import { FirebaseService } from 'src/infra/firebase.service';


@Module({
  providers: [ConvertPdfToImagesUseCase, PetitionsService, OcrService, FirebaseService],
  controllers: [PetitionsController]
})
export class PetitionsModule { }
