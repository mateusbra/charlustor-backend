import { Injectable, Logger } from '@nestjs/common';

export type CardInfo = { id: number; name: string; type: string };

const YGOPRODECK_CARD_INFO_URL = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
const EXTRA_DECK_TYPE_PATTERN = /fusion|synchro|xyz|link/i;

@Injectable()
export class CardLookupService {
  private readonly logger = new Logger(CardLookupService.name);

  async resolve(name: string): Promise<CardInfo | null> {
    try {
      const url = `${YGOPRODECK_CARD_INFO_URL}?name=${encodeURIComponent(name)}`;
      const res = await fetch(url);
      if (!res.ok) return null;

      const body: { data?: Array<{ id: number; name: string; type: string }> } = await res.json();
      const card = body.data?.[0];
      return card ? { id: card.id, name: card.name, type: card.type } : null;
    } catch (error) {
      this.logger.warn(`Failed to resolve card "${name}" via YGOPRODeck: ${(error as Error).message}`);
      return null;
    }
  }

  isExtraDeckType(type: string): boolean {
    return EXTRA_DECK_TYPE_PATTERN.test(type);
  }
}
