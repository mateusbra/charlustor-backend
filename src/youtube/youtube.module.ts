import { Module } from '@nestjs/common';
import { YoutubeService } from './youtube.service.js';
import { YoutubeController } from './youtube.controller.js';

@Module({
  controllers: [YoutubeController],
  providers: [YoutubeService],
})
export class YoutubeModule {}
