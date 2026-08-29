import { Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { RegistrationsService } from './registrations.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

@Controller('tournaments/:id')
export class RegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  @Post('register')
  @UseGuards(JwtAuthGuard)
  register(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.registrationsService.register(id, user.id);
  }

  @Post('withdraw')
  @UseGuards(JwtAuthGuard)
  withdraw(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.registrationsService.withdraw(id, user.id);
  }

  @Get('participants')
  listParticipants(@Param('id') id: string) {
    return this.registrationsService.listParticipants(id);
  }

  @Delete('participants/:userId')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER', 'ADMIN')
  remove(@Param('id') id: string, @Param('userId') userId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.registrationsService.remove(id, userId, user);
  }
}
