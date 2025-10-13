import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { PrismaExceptionFilter } from './infra/prisma/prisma-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Configurar timezone para São Paulo
  process.env.TZ = 'America/Sao_Paulo';
  
  logger.log('Iniciando aplicação NestJS...');
  logger.log(`Timezone configurado para: ${process.env.TZ}`);

  const app = await NestFactory.create(AppModule, {
    // logger: process.env.NODE_ENV === 'test' ? ['log', 'error', 'warn', 'debug', 'verbose'] : console,
  });
  app.enableCors();
  // app.useGlobalInterceptors(new ErrorInterceptor());
  app.useGlobalFilters(new PrismaExceptionFilter());
  logger.log('Aplicando configurações globais...');
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  // Configuração global de porta
  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`Aplicação rodando na porta ${port}`);
}

bootstrap();
