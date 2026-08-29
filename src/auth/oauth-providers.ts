export type OAuthProviderName = 'google' | 'discord';

export const OAUTH_PROVIDERS: OAuthProviderName[] = ['google', 'discord'];

export function isOAuthProviderConfigured(provider: string): provider is OAuthProviderName {
  if (provider === 'google') {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  }
  if (provider === 'discord') {
    return Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
  }
  return false;
}
