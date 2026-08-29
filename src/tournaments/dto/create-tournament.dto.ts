import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { TournamentFormat } from '../../generated/prisma/enums.js';

export class CreateTournamentDto {
  @IsString()
  @MinLength(3)
  name!: string;

  @IsEnum(TournamentFormat)
  format!: TournamentFormat;

  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  roundsCount?: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  topCutSize?: number;
}
