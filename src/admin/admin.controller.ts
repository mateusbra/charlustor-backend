import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import { SeasonsService } from '../seasons/seasons.service.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(
    private readonly usersService: UsersService,
    private readonly seasonsService: SeasonsService,
  ) {}

  @Get('users')
  listUsers() {
    return this.usersService.findAll();
  }

  @Patch('users/:id/role')
  updateUserRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.usersService.updateRole(id, dto.role);
  }

  @Get('seasons')
  listSeasons() {
    return this.seasonsService.findAll();
  }

  @Patch('seasons/:id/activate')
  activateSeason(@Param('id') id: string) {
    return this.seasonsService.activate(id);
  }

  @Patch('seasons/:id/close')
  closeSeason(@Param('id') id: string) {
    return this.seasonsService.close(id);
  }
}
