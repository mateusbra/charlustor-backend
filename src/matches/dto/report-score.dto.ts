import { IsString, Matches } from 'class-validator';

export class ReportScoreDto {
  @IsString()
  @Matches(/^\d+-\d+$/, { message: 'score must be in the format "<wins>-<losses>", e.g. "2-1"' })
  score!: string;
}
