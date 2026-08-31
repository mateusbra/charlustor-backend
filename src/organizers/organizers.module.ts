import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { OrganizersService } from './organizers.service.js';
import { OrganizersController } from './organizers.controller.js';

@Module({
  imports: [PassportModule.register({})],
  controllers: [OrganizersController],
  providers: [OrganizersService],
})
export class OrganizersModule {}
