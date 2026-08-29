import { IsOptional, Matches } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @Matches(/^[a-zA-Z0-9_-]{3,20}$/, {
    message: 'nickname must be 3-20 characters (letters, numbers, _ or -)',
  })
  nickname?: string;

  @IsOptional()
  @Matches(/^[\d\s-]{9,17}$/, { message: 'masterDuelFriendCode has an invalid format' })
  masterDuelFriendCode?: string;
}
