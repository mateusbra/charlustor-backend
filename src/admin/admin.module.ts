import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AdminController } from './admin.controller.js';
import { UsersModule } from '../users/users.module.js';
import { SeasonsModule } from '../seasons/seasons.module.js';

@Module({
  imports: [PassportModule.register({}), UsersModule, SeasonsModule],
  controllers: [AdminController],
})
export class AdminModule {}
