import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard';
import { PetitionsModule } from './modules/petitions/petitions.module';
import { ParticipantsModule } from './modules/participants/participants.module';
import { LoggingTimeMiddleware } from './middleware/logging-time.middleware';
import { TransactionMiddleware } from './middleware/transaction.middleware';
import { CongregationsModule } from './modules/congregations/congregations.module';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './infra/prisma/prisma.module';
import { PrismaConnectionMiddleware } from './infra/prisma/prisma-connection.middleware';

@Module({
  imports: [PrismaModule, PetitionsModule, ParticipantsModule,  CongregationsModule, ScheduleModule.forRoot()],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TransactionMiddleware).forRoutes('*');
    consumer.apply(LoggingTimeMiddleware).forRoutes('*');
    consumer.apply(PrismaConnectionMiddleware).forRoutes('*');
  }
}
