import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

const SCORE_PATTERN = /^\d+-\d+$/;

function mirrorScore(score: string): string {
  const [a, b] = score.split('-');
  return `${b}-${a}`;
}

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(matchId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Match not found');
    return match;
  }

  async report(matchId: string, requester: AuthenticatedUser, score: string) {
    if (!SCORE_PATTERN.test(score)) {
      throw new BadRequestException('Score must be in the format "<yourWins>-<opponentWins>", e.g. "2-1"');
    }

    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { participantA: true, participantB: true },
    });
    if (!match) throw new NotFoundException('Match not found');
    if (!match.participantB) {
      throw new ConflictException('This match is a bye and does not need a report');
    }

    const isA = match.participantA.userId === requester.id;
    const isB = match.participantB.userId === requester.id;
    if (!isA && !isB) {
      throw new ForbiddenException('You are not a participant in this match');
    }

    const data = isA ? { reportedScoreA: score } : { reportedScoreB: score };
    const otherScore = isA ? match.reportedScoreB : match.reportedScoreA;

    if (otherScore) {
      // Reports are mirrored ("my wins-their wins" from each side) — they agree
      // when one is the reverse of the other.
      const agree = isA ? mirrorScore(otherScore) === score : mirrorScore(score) === otherScore;
      if (agree) {
        return this.prisma.match.update({
          where: { id: matchId },
          data: {
            ...data,
            resultStatus: 'CONFIRMED',
            confirmedScore: isA ? score : mirrorScore(score),
            confirmedAt: new Date(),
          },
        });
      }
      return this.prisma.match.update({ where: { id: matchId }, data: { ...data, resultStatus: 'DISPUTED' } });
    }

    return this.prisma.match.update({ where: { id: matchId }, data });
  }

  async resolve(matchId: string, requester: AuthenticatedUser, score: string) {
    if (!SCORE_PATTERN.test(score)) {
      throw new BadRequestException('Score must be in the format "<A wins>-<B wins>", e.g. "2-1"');
    }

    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { round: { include: { tournament: true } } },
    });
    if (!match) throw new NotFoundException('Match not found');

    const tournament = match.round.tournament;
    if (tournament.organizerId !== requester.id && requester.role !== 'ADMIN') {
      throw new ForbiddenException('You do not own this tournament');
    }

    return this.prisma.match.update({
      where: { id: matchId },
      data: {
        resultStatus: 'CONFIRMED',
        confirmedScore: score,
        resolvedByUserId: requester.id,
        confirmedAt: new Date(),
      },
    });
  }
}
