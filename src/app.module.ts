import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { TournamentsModule } from './tournaments/tournaments.module.js';
import { RegistrationsModule } from './registrations/registrations.module.js';
import { DecksModule } from './decks/decks.module.js';
import { TournamentEngineModule } from './tournament-engine/tournament-engine.module.js';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    UsersModule,
    AuthModule,
    TournamentsModule,
    RegistrationsModule,
    DecksModule,
    TournamentEngineModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
