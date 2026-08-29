import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { DeckRecognitionService, type RecognizedCard } from './deck-recognition.service.js';
import { CardLookupService } from './card-lookup.service.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

export type DeckImageFile = { buffer: Buffer; mimetype: string };
export type DecodedCard = { id: number | null; name: string; quantity: number };
export type DecodedDeck = { main: DecodedCard[]; extra: DecodedCard[]; side: DecodedCard[] };

@Injectable()
export class DecksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recognitionService: DeckRecognitionService,
    private readonly cardLookupService: CardLookupService,
  ) {}

  async submit(participantId: string, requester: AuthenticatedUser, files: { mainExtra: DeckImageFile; side: DeckImageFile }) {
    const participant = await this.findParticipantWithTournament(participantId);
    if (participant.userId !== requester.id) {
      throw new ForbiddenException('You can only submit your own deck');
    }
    if (participant.tournament.status !== 'REGISTRATION_OPEN') {
      throw new ConflictException('Deck submission is only allowed while registration is open');
    }

    const [mainExtraCards, sideCards] = await Promise.all([
      this.recognitionService.recognizeCards(files.mainExtra.buffer.toString('base64'), files.mainExtra.mimetype),
      this.recognitionService.recognizeCards(files.side.buffer.toString('base64'), files.side.mimetype),
    ]);

    const [main, extra] = await this.splitMainExtra(mainExtraCards);
    const side = await this.resolveAll(sideCards);

    const decodedCards: DecodedDeck = { main, extra, side };
    const mainExtraImage = toDataUrl(files.mainExtra);
    const sideImage = toDataUrl(files.side);

    return this.prisma.deck.upsert({
      where: { participantId },
      create: { participantId, mainExtraImage, sideImage, decodedCards, validationStatus: 'PENDING' },
      update: { mainExtraImage, sideImage, decodedCards, validationStatus: 'PENDING' },
    });
  }

  async findByParticipant(participantId: string) {
    const deck = await this.prisma.deck.findUnique({ where: { participantId } });
    if (!deck) throw new NotFoundException('Deck not found');
    return deck;
  }

  async approve(participantId: string, requester: AuthenticatedUser) {
    await this.assertOwner(participantId, requester);
    await this.findByParticipant(participantId);
    return this.prisma.deck.update({ where: { participantId }, data: { validationStatus: 'APPROVED' } });
  }

  async reject(participantId: string, requester: AuthenticatedUser) {
    await this.assertOwner(participantId, requester);
    await this.findByParticipant(participantId);
    return this.prisma.deck.update({ where: { participantId }, data: { validationStatus: 'REJECTED' } });
  }

  private async splitMainExtra(cards: RecognizedCard[]): Promise<[DecodedCard[], DecodedCard[]]> {
    const main: DecodedCard[] = [];
    const extra: DecodedCard[] = [];
    for (const card of cards) {
      const info = await this.cardLookupService.resolve(card.name);
      const entry: DecodedCard = { id: info?.id ?? null, name: info?.name ?? card.name, quantity: card.quantity };
      if (info && this.cardLookupService.isExtraDeckType(info.type)) {
        extra.push(entry);
      } else {
        main.push(entry);
      }
    }
    return [main, extra];
  }

  private async resolveAll(cards: RecognizedCard[]): Promise<DecodedCard[]> {
    const resolved: DecodedCard[] = [];
    for (const card of cards) {
      const info = await this.cardLookupService.resolve(card.name);
      resolved.push({ id: info?.id ?? null, name: info?.name ?? card.name, quantity: card.quantity });
    }
    return resolved;
  }

  private async findParticipantWithTournament(participantId: string) {
    const participant = await this.prisma.participant.findUnique({
      where: { id: participantId },
      include: { tournament: true },
    });
    if (!participant) throw new NotFoundException('Participant not found');
    return participant;
  }

  private async assertOwner(participantId: string, requester: AuthenticatedUser) {
    const participant = await this.findParticipantWithTournament(participantId);
    if (participant.tournament.organizerId !== requester.id && requester.role !== 'ADMIN') {
      throw new ForbiddenException('You do not own this tournament');
    }
  }
}

function toDataUrl(file: DeckImageFile): string {
  return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
}
