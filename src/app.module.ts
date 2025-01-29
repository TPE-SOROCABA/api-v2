import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { GeoLocationService } from './app.service';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard';
import { PetitionsModule } from './modules/petitions/petitions.module';
import { PrismaService } from './infra/prisma.service';
import { ParticipantsModule } from './modules/participants/participants.module';
import { LoggingTimeMiddleware } from './middleware/logging-time.middleware';
import { TransactionMiddleware } from './middleware/transaction.middleware';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [PetitionsModule, ParticipantsModule, HttpModule],
  controllers: [AppController],
  providers: [
    GeoLocationService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    PrismaService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TransactionMiddleware).forRoutes('*');
    consumer.apply(LoggingTimeMiddleware).forRoutes('*');
  }
}
