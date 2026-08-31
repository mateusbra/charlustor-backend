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
import { MatchesModule } from './matches/matches.module.js';
import { StandingsModule } from './standings/standings.module.js';
import { SeasonsModule } from './seasons/seasons.module.js';
import { OrganizersModule } from './organizers/organizers.module.js';
import { AdminModule } from './admin/admin.module.js';

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
    MatchesModule,
    StandingsModule,
    SeasonsModule,
    OrganizersModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
