import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { GoogleStrategy } from './strategies/google.strategy.js';
import { DiscordStrategy } from './strategies/discord.strategy.js';
import { UsersModule } from '../users/users.module.js';
import { MailModule } from '../mail/mail.module.js';
import { isOAuthProviderConfigured } from './oauth-providers.js';

@Module({
  imports: [PassportModule, JwtModule.register({}), UsersModule, MailModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    ...(isOAuthProviderConfigured('google') ? [GoogleStrategy] : []),
    ...(isOAuthProviderConfigured('discord') ? [DiscordStrategy] : []),
  ],
})
export class AuthModule {}
