import { BadRequestException, Controller, Get, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { PrismaService } from './infra/prisma/prisma.service';
import { TransactionLogger } from './infra/transaction.logger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'node:path';
import { ConvertPdfToImagesUseCase } from './modules/petitions/convert-pdf-to-images.usecase';
import { ImageParameters, OcrService } from './infra/ocr.service';
import * as fs from 'fs';

@Controller()
export class AppController {
  logger = new TransactionLogger(AppController.name);
  constructor(private prismaService: PrismaService, private convertPdfToImagesUseCase: ConvertPdfToImagesUseCase, private ocrService: OcrService) { }

  @Get('/health-check')
  async healthCheck() {
    const [{ max_connections }] = (await this.prismaService.$queryRaw`show max_connections`) as { max_connections: string }[];
    const [{ count: countIdle }] = (await this.prismaService
      .$queryRaw`select count(1)  from pg_stat_activity where state = 'idle' and datname = 'tpedigital'`) as {
        count: BigInt;
      }[];
    const [{ count: countActive }] = (await this.prismaService
      .$queryRaw`select count(1)  from pg_stat_activity where state = 'active' and datname = 'tpedigital'`) as {
        count: BigInt;
      }[];

    return {
      message: `[${new Date().toISOString()}] - O servidor está em execução - Produção!`,
      database_info: {
        active: +countActive.toString(),
        idle: +countIdle.toString(),
        max_connections: +max_connections,
      },
    };
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads', // Pasta para salvar o PDF recebido
        filename: (req, file, callback) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const fileExtName = extname(file.originalname);
          callback(null, `${uniqueSuffix}${fileExtName}`);
        },
      }),
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    const imagesPath = await this.convertPdfToImagesUseCase.execute(file.path);
    const nameParams: ImageParameters = {
      "x": 536,
      "y": 344,
      "width": 1752,
      "height": 76
    }
    const emailParams: ImageParameters = {
      "x": 1576,
      "y": 466,
      "width": 736,
      "height": 72
    }
    const phoneParams: ImageParameters = {
      "x": 1604,
      "y": 558,
      "width": 680,
      "height": 72
    }
    const name = await this.ocrService.processImage(imagesPath[0], nameParams);
    const email = await this.ocrService.processImage(imagesPath[0], emailParams);
    const phone = await this.ocrService.processImage(imagesPath[0], phoneParams);
    imagesPath.forEach(imagePath => {
      fs.unlinkSync(imagePath);
      this.logger.log(`Imagem temporária excluída: ${imagePath}`);
    });
    return { name, email, phone };
  }
}

