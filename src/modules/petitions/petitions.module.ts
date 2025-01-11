import { Module } from '@nestjs/common';
import { ConvertPdfToImagesUseCase } from './convert-pdf-to-images.usecase';
import { PetitionsController } from './petitions.controller';
import { PetitionsService } from './petitions.service';
import { PrismaService } from 'src/infra/prisma.service';
import { S3Service } from 'src/infra/s3.service';


@Module({
  providers: [ConvertPdfToImagesUseCase, PetitionsService, S3Service, PrismaService],
  controllers: [PetitionsController]
})
export class PetitionsModule {}
