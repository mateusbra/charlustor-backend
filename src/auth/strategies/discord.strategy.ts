import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile } from 'passport-discord';
import { AuthService } from '../auth.service.js';

type VerifyCallback = (err: Error | null, user?: false | { id: string; email: string; role: string }) => void;

@Injectable()
export class DiscordStrategy extends PassportStrategy(Strategy, 'discord') {
  constructor(private readonly authService: AuthService) {
    super({
      clientID: process.env.DISCORD_CLIENT_ID as string,
      clientSecret: process.env.DISCORD_CLIENT_SECRET as string,
      callbackURL: `${process.env.OAUTH_CALLBACK_BASE_URL}/auth/oauth/discord/callback`,
      scope: ['identify', 'email'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ) {
    if (!profile.email) return done(new Error('Discord account has no verified email'), false);

    const user = await this.authService.validateOAuthLogin('discord', profile.id, profile.email);
    done(null, user);
  }
}
