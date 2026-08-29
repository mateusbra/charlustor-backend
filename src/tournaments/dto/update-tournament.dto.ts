import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { TournamentFormat } from '../../generated/prisma/enums.js';

export class UpdateTournamentDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  name?: string;

  @IsOptional()
  @IsEnum(TournamentFormat)
  format?: TournamentFormat;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  roundsCount?: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  topCutSize?: number;
}
