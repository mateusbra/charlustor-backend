import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { DeckRecognitionService } from './deck-recognition.service.js';

describe('DeckRecognitionService', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it('reports as not configured when ANTHROPIC_API_KEY is unset', () => {
    const service = new DeckRecognitionService();
    expect(service.isConfigured()).toBe(false);
  });

  it('throws a clear error instead of guessing when not configured', async () => {
    const service = new DeckRecognitionService();
    await expect(service.recognizeCards('base64data', 'image/png')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('reports as configured once ANTHROPIC_API_KEY is set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const service = new DeckRecognitionService();
    expect(service.isConfigured()).toBe(true);
  });
});
