import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { DecksService } from './decks.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

type UploadedDeckFiles = { mainExtra?: Express.Multer.File[]; side?: Express.Multer.File[] };

@Controller('participants/:id/deck')
export class DecksController {
  constructor(private readonly decksService: DecksService) {}

  @Put()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileFieldsInterceptor([{ name: 'mainExtra', maxCount: 1 }, { name: 'side', maxCount: 1 }]))
  submit(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFiles() files: UploadedDeckFiles,
  ) {
    const mainExtra = files?.mainExtra?.[0];
    const side = files?.side?.[0];
    if (!mainExtra || !side) {
      throw new BadRequestException('Both "mainExtra" and "side" images are required');
    }
    return this.decksService.submit(id, user, { mainExtra, side });
  }

  @Get()
  findOne(@Param('id') id: string) {
    return this.decksService.findByParticipant(id);
  }

  @Post('approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER', 'ADMIN')
  approve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.decksService.approve(id, user);
  }

  @Post('reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER', 'ADMIN')
  reject(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.decksService.reject(id, user);
  }
}
