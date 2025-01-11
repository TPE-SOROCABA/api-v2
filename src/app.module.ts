import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard';
import { PetitionsModule } from './module/petitions/petition.module';
import { PrismaService } from './infra/prisma.service';

@Module({
  imports: [PetitionsModule],
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
