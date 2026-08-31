import { Injectable, Logger } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';

export type YoutubeVideo = {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  publishedAt: string;
};

// Charlustor's own channel — resolved from youtube.com/@charlustor's canonical link.
// Overridable via YOUTUBE_CHANNEL_ID so this doesn't need configuration to work for this project.
const DEFAULT_CHANNEL_ID = 'UCIeFgGZfdJxePiRMr5MK_Ug';
const CACHE_TTL_MS = 15 * 60 * 1000;

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

@Injectable()
export class YoutubeService {
  private readonly logger = new Logger(YoutubeService.name);
  private cache: { videos: YoutubeVideo[]; expiresAt: number } | null = null;

  async getRecentVideos(limit = 6): Promise<YoutubeVideo[]> {
    const channelId = process.env.YOUTUBE_CHANNEL_ID || DEFAULT_CHANNEL_ID;
    if (!channelId) return [];

    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.videos.slice(0, limit);
    }

    try {
      const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
      if (!res.ok) throw new Error(`YouTube feed responded with ${res.status}`);
      const xml = await res.text();
      const videos = parseFeed(xml);
      this.cache = { videos, expiresAt: Date.now() + CACHE_TTL_MS };
      return videos.slice(0, limit);
    } catch (error) {
      this.logger.warn(`Failed to fetch YouTube videos: ${error instanceof Error ? error.message : error}`);
      return this.cache?.videos.slice(0, limit) ?? [];
    }
  }
}

function parseFeed(xml: string): YoutubeVideo[] {
  const parsed = parser.parse(xml);
  const rawEntries = parsed?.feed?.entry;
  if (!rawEntries) return [];
  const entries = Array.isArray(rawEntries) ? rawEntries : [rawEntries];

  return entries
    .map((entry): YoutubeVideo | null => {
      const id = entry['yt:videoId'];
      const title = entry['media:group']?.['media:title'] ?? entry.title;
      const thumbnailUrl = entry['media:group']?.['media:thumbnail']?.['@_url'];
      const publishedAt = entry.published;
      if (!id || !title || !thumbnailUrl || !publishedAt) return null;
      return { id, title, url: `https://www.youtube.com/watch?v=${id}`, thumbnailUrl, publishedAt };
    })
    .filter((v): v is YoutubeVideo => v !== null);
}
