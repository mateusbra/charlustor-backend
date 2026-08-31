import { Controller, Get } from '@nestjs/common';
import { YoutubeService } from './youtube.service.js';

@Controller('youtube')
export class YoutubeController {
  constructor(private readonly youtubeService: YoutubeService) {}

  @Get('videos')
  getVideos() {
    return this.youtubeService.getRecentVideos();
  }
}
