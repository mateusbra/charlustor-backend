import { Controller, Get, UseGuards } from '@nestjs/common';
import { OrganizersService } from './organizers.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

@Controller('organizers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizersController {
  constructor(private readonly organizersService: OrganizersService) {}

  @Get('me/dashboard')
  @Roles('ORGANIZER', 'ADMIN')
  getDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.organizersService.getDashboard(user.id);
  }
}
