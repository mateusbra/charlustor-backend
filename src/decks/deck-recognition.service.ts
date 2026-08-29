import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

export type RecognizedCard = { name: string; quantity: number };

function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(json)?/i, '')
    .replace(/```$/, '')
    .trim();
}

@Injectable()
export class DeckRecognitionService {
  private readonly client: Anthropic | null;

  constructor() {
    this.client = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async recognizeCards(imageBase64: string, mediaType: string): Promise<RecognizedCard[]> {
    if (!this.client) {
      throw new ServiceUnavailableException('Deck image recognition is not configured (missing ANTHROPIC_API_KEY)');
    }

    const response = await this.client.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-5',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType as 'image/png' | 'image/jpeg', data: imageBase64 },
            },
            {
              type: 'text',
              text:
                'This is a screenshot from the Yu-Gi-Oh! Master Duel client showing a list of cards. ' +
                'Identify every card visible and how many copies of each. Respond with ONLY a JSON object ' +
                'of the shape {"cards":[{"name":"<official English card name>","quantity":<number>}]}. ' +
                'No prose, no markdown code fences, just the JSON object.',
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
    if (!textBlock) throw new BadRequestException('Could not read any cards from the image');

    try {
      const parsed: unknown = JSON.parse(stripCodeFences(textBlock.text));
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !Array.isArray((parsed as { cards?: unknown }).cards)
      ) {
        throw new Error('unexpected shape');
      }
      return (parsed as { cards: RecognizedCard[] }).cards;
    } catch {
      throw new BadRequestException('Could not read any cards from the image');
    }
  }
}
