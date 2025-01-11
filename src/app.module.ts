import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard';
import { PetitionsModule } from './modules/petitions/petitions.module';
import { PrismaService } from './infra/prisma.service';
import { ParticipantsModule } from './modules/participants/participants.module';

@Module({
  imports: [PetitionsModule, ParticipantsModule],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    PrismaService
  ],
})
export class AppModule {}
