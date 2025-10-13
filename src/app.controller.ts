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
    // Verifica status SEM acordar o banco
    const dbStatus = this.prismaService.getConnectionStatus();

    const baseResponse = {
      timestamp: new Date().toISOString(),
      server_status: "🟢 ATIVO",
      database_status: dbStatus.status,
      neon_serverless: true,
      connection_info: {
        connected: dbStatus.connected,
        last_activity: dbStatus.lastActivity
      }
    };

    // Se o banco está HIBERNANDO, não tenta acordá-lo
    if (!dbStatus.connected) {
      return {
        ...baseResponse,
        message: "Servidor ativo, Neon hibernando (economia de recursos)",
        note: "💡 O Neon despertará automaticamente na próxima operação de banco",
        database_info: {
          status: "SLEEPING",
          reason: "Sem atividade por 5+ minutos - comportamento normal do serverless"
        }
      };
    }

    // Se está ativo, faz as consultas informativas
    try {
      const [{ max_connections }] = (await this.prismaService.$queryRaw`show max_connections`) as { max_connections: string }[];
      const [{ count: countIdle }] = (await this.prismaService
        .$queryRaw`select count(1) from pg_stat_activity where state = 'idle' and datname = 'tpedigital'`) as {
          count: BigInt;
        }[];
      const [{ count: countActive }] = (await this.prismaService
        .$queryRaw`select count(1) from pg_stat_activity where state = 'active' and datname = 'tpedigital'`) as {
          count: BigInt;
        }[];

      return {
        ...baseResponse,
        message: "Servidor e Neon ativos - Todas as conexões funcionando",
        database_info: {
          status: "ACTIVE",
          connections: {
            active: +countActive.toString(),
            idle: +countIdle.toString(),
            max_allowed: +max_connections
          },
          performance: "✅ Pronto para consultas"
        }
      };
    } catch (error) {
      // Se falhar mesmo estando "conectado", pode ter hibernado durante a consulta
      return {
        ...baseResponse,
        message: "Neon hibernou durante a verificação - será reconectado automaticamente",
        database_info: {
          status: "HIBERNATING",
          note: "Hibernou entre a verificação de status e a consulta - normal em serverless"
        }
      };
    }
  }

  @Get('/database/wakeup')
  async wakeupDatabase() {
    const initialStatus = this.prismaService.getConnectionStatus();

    if (initialStatus.connected) {
      return {
        message: "Neon já está ativo - Não precisa despertar",
        status: "ALREADY_ACTIVE",
        timestamp: new Date().toISOString()
      };
    }

    try {
      await this.prismaService.ensureConnection();
      return {
        message: "✅ Neon despertado com sucesso!",
        status: "WOKEN_UP",
        timestamp: new Date().toISOString(),
        performance: "Banco pronto para operações"
      };
    } catch (error) {
      console.error('❌ Erro ao tentar despertar o Neon via endpoint:', error.message);
      return {
        message: "❌ Falha ao despertar Neon",
        status: "WAKE_UP_FAILED",
        error: error.message,
        timestamp: new Date().toISOString(),
        suggestion: "Tente novamente em alguns segundos"
      };
    }
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

