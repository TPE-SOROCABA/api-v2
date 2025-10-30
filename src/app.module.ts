import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard';
import { PetitionsModule } from './modules/petitions/petitions.module';
import { ParticipantsModule } from './modules/participants/participants.module';
import { LoggingTimeMiddleware } from './middleware/logging-time.middleware';
import { TransactionMiddleware } from './middleware/transaction.middleware';
import { CongregationsModule } from './modules/congregations/congregations.module';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './infra/prisma/prisma.module';
import { PrismaConnectionMiddleware } from './infra/prisma/prisma-connection.middleware';
import { PrismaReconnectionInterceptor } from './infra/prisma/prisma-reconnection.interceptor';
import { ConvertPdfToImagesUseCase } from './modules/petitions/convert-pdf-to-images.usecase';
import { OcrService } from './infra/ocr.service';
import { GroupsModule } from './modules/groups/groups.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { PointsModule } from './modules/points/points.module';
import { DesignationsModule } from './modules/designations/designations.module';

@Module({
  imports: [PrismaModule, PetitionsModule, ParticipantsModule, CongregationsModule, ScheduleModule.forRoot(), GroupsModule, DashboardModule, PointsModule, DesignationsModule],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: PrismaReconnectionInterceptor,
    },
    ConvertPdfToImagesUseCase,
    OcrService
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TransactionMiddleware).forRoutes('*');
    consumer.apply(LoggingTimeMiddleware).forRoutes('*');
    consumer.apply(PrismaConnectionMiddleware).forRoutes('*');
  }
}
