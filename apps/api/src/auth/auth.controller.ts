import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { RequestOtpInput, requestOtpSchema, VerifyOtpInput, verifyOtpSchema } from '@tembo/shared';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../common/auth';
import { ZodPipe } from '../common/zod.pipe';
import { config } from '../config';
import { UsersService } from '../users/users.service';
import { AuthService, IssuedTokens } from './auth.service';

function cookieBase(): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/' };
}

export function setAuthCookies(res: Response, t: IssuedTokens) {
  res.cookie(ACCESS_COOKIE, t.accessToken, { ...cookieBase(), maxAge: config.accessTokenTtlSec * 1000 });
  res.cookie(REFRESH_COOKIE, t.refreshToken, { ...cookieBase(), maxAge: config.refreshTokenTtlDays * 86_400_000 });
}

@Controller('auth')
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly users: UsersService) {}

  @Post('otp/request')
  @HttpCode(200)
  async requestOtp(@Body(new ZodPipe(requestOtpSchema)) body: RequestOtpInput) {
    await this.auth.requestLoginOtp(body.email);
    return { ok: true };
  }

  @Post('otp/verify')
  @HttpCode(200)
  async verifyOtp(
    @Body(new ZodPipe(verifyOtpSchema)) body: VerifyOtpInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, isNew, tokens } = await this.auth.login(body.email, body.code, body.referralCode, req.headers['user-agent']);
    setAuthCookies(res, tokens);
    return { isNew, me: await this.users.me(user.id) };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], req.headers['user-agent']);
    setAuthCookies(res, tokens);
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(ACCESS_COOKIE, cookieBase());
    res.clearCookie(REFRESH_COOKIE, cookieBase());
    return { ok: true };
  }
}
