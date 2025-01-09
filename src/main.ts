import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  try {
    logger.log('Iniciando aplicação NestJS...');

    const app = await NestFactory.create(AppModule);

    // Configuração global de porta
    const port = process.env.PORT || 3000;
    await app.listen(port);

    logger.log(`Aplicação rodando na porta ${port}`);
  } catch (error) {
    logger.error('Erro crítico durante a inicialização da aplicação:', error.message);
    process.exit(1); // Finaliza o processo com código de erro
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
