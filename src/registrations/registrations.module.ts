import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { RegistrationsService } from './registrations.service.js';
import { RegistrationsController } from './registrations.controller.js';
import { TournamentsModule } from '../tournaments/tournaments.module.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [PassportModule.register({}), TournamentsModule, UsersModule],
  controllers: [RegistrationsController],
  providers: [RegistrationsService],
})
export class RegistrationsModule {}
