import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      logger.log('Iniciando aplicação NestJS...');

      const app = await NestFactory.create(AppModule);
      app.enableCors();
      logger.log('Aplicando configurações globais...');
      app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        transform: true,
      }));

      // Configuração global de porta
      const port = process.env.PORT || 3000;
      await app.listen(port);

      logger.log(`Aplicação rodando na porta ${port}`);
      break; // Se a inicialização for bem-sucedida, sai do loop
    } catch (error) {
      attempt++;
      logger.error(`Erro crítico durante a inicialização da aplicação (tentativa ${attempt} de ${maxRetries}):`, error.message);
      if (attempt >= maxRetries) {
        process.exit(1); // Finaliza o processo com código de erro após atingir o número máximo de tentativas
      }
    }
  }
}

// Tratamento global de erros para evitar que o Node.js encerre inesperadamente
process.on('uncaughtException', (error) => {
  const logger = new Logger('UncaughtException');
  logger.error('Erro não capturado:', error.message, error.stack);
});

process.on('unhandledRejection', (reason: any) => {
  const logger = new Logger('UnhandledRejection');
  logger.error('Rejeição não tratada:', reason);
});

bootstrap();
