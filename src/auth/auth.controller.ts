import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, type TokenPair } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { OAuthGuard } from './guards/oauth.guard.js';
import { OAUTH_PROVIDERS, isOAuthProviderConfigured } from './oauth-providers.js';
import type { AuthenticatedUser } from './decorators/current-user.decorator.js';

const REFRESH_COOKIE = 'refresh_token';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('oauth/providers')
  listProviders() {
    return Object.fromEntries(OAUTH_PROVIDERS.map((p) => [p, isOAuthProviderConfigured(p)]));
  }

  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.authService.register(dto.email, dto.password);
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken, user };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.authService.login(dto.email, dto.password);
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken, user };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (refreshToken) await this.authService.logout(refreshToken);
    res.clearCookie(REFRESH_COOKIE, { path: '/auth' });
    return { success: true };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    const { user, tokens } = await this.authService.refresh(refreshToken ?? '');
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken, user };
  }

  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return { success: true };
  }

  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.password);
    return { success: true };
  }

  @Get('oauth/:provider')
  @UseGuards(OAuthGuard)
  oauthRedirect() {
    // Guard performs the redirect to the provider; this handler never runs.
  }

  @Get('oauth/:provider/callback')
  @UseGuards(OAuthGuard)
  async oauthCallback(@Req() req: Request, @Res() res: Response) {
    const user = req.user as AuthenticatedUser;
    const tokens = await this.authService.issueTokenPair(user);
    this.setRefreshCookie(res, tokens);
    // The frontend picks up the session via POST /auth/refresh (cookie already
    // set above) instead of carrying the access token through the redirect URL.
    res.redirect(`${process.env.FRONTEND_URL}/oauth/callback`);
  }

  private setRefreshCookie(res: Response, tokens: TokenPair) {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      expires: tokens.refreshExpiresAt,
      path: '/auth',
    });
  }
}
