import { Injectable, NotImplementedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { isOAuthProviderConfigured } from '../oauth-providers.js';

const GoogleGuard = AuthGuard('google');
const DiscordGuard = AuthGuard('discord');

@Injectable()
export class OAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const provider = request.params.provider;

    if (!isOAuthProviderConfigured(provider)) {
      throw new NotImplementedException(`OAuth provider "${provider}" is not configured`);
    }

    const guard = provider === 'google' ? new GoogleGuard() : new DiscordGuard();
    return guard.canActivate(context);
  }
}
