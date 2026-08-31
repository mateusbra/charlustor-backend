import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { YoutubeService } from './youtube.service.js';

function feedXml(entries: { id: string; title: string; thumbnail: string; published: string }[]) {
  const entriesXml = entries
    .map(
      (e) => `
    <entry>
      <yt:videoId>${e.id}</yt:videoId>
      <title>${e.title}</title>
      <published>${e.published}</published>
      <media:group>
        <media:title>${e.title}</media:title>
        <media:thumbnail url="${e.thumbnail}" width="480" height="360"/>
      </media:group>
    </entry>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
  <feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
    <title>charlustor</title>
    ${entriesXml}
  </feed>`;
}

describe('YoutubeService', () => {
  const originalEnv = process.env.YOUTUBE_CHANNEL_ID;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    process.env.YOUTUBE_CHANNEL_ID = originalEnv;
    vi.unstubAllGlobals();
  });

  it('parses videos from the Atom feed', async () => {
    const service = new YoutubeService();
    const xml = feedXml([
      { id: 'v1', title: 'Vídeo 1', thumbnail: 'https://i.ytimg.com/vi/v1/hqdefault.jpg', published: '2026-08-01T00:00:00+00:00' },
      { id: 'v2', title: 'Vídeo 2', thumbnail: 'https://i.ytimg.com/vi/v2/hqdefault.jpg', published: '2026-08-02T00:00:00+00:00' },
    ]);
    vi.mocked(fetch).mockResolvedValue({ ok: true, text: async () => xml } as Response);

    const videos = await service.getRecentVideos();

    expect(videos).toEqual([
      { id: 'v1', title: 'Vídeo 1', url: 'https://www.youtube.com/watch?v=v1', thumbnailUrl: 'https://i.ytimg.com/vi/v1/hqdefault.jpg', publishedAt: '2026-08-01T00:00:00+00:00' },
      { id: 'v2', title: 'Vídeo 2', url: 'https://www.youtube.com/watch?v=v2', thumbnailUrl: 'https://i.ytimg.com/vi/v2/hqdefault.jpg', publishedAt: '2026-08-02T00:00:00+00:00' },
    ]);
  });

  it('respects the limit parameter', async () => {
    const service = new YoutubeService();
    const xml = feedXml([
      { id: 'v1', title: 'A', thumbnail: 'https://i.ytimg.com/vi/v1/hqdefault.jpg', published: '2026-08-01T00:00:00+00:00' },
      { id: 'v2', title: 'B', thumbnail: 'https://i.ytimg.com/vi/v2/hqdefault.jpg', published: '2026-08-02T00:00:00+00:00' },
    ]);
    vi.mocked(fetch).mockResolvedValue({ ok: true, text: async () => xml } as Response);

    const videos = await service.getRecentVideos(1);

    expect(videos).toHaveLength(1);
  });

  it('caches the result and does not refetch within the TTL', async () => {
    const service = new YoutubeService();
    const xml = feedXml([{ id: 'v1', title: 'A', thumbnail: 'https://i.ytimg.com/vi/v1/hqdefault.jpg', published: '2026-08-01T00:00:00+00:00' }]);
    vi.mocked(fetch).mockResolvedValue({ ok: true, text: async () => xml } as Response);

    await service.getRecentVideos();
    await service.getRecentVideos();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns an empty array when the fetch fails and there is no cache', async () => {
    const service = new YoutubeService();
    vi.mocked(fetch).mockRejectedValue(new Error('network error'));

    const videos = await service.getRecentVideos();

    expect(videos).toEqual([]);
  });
});
