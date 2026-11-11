import { Body, Controller, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
import {
  RequestCmuEmailInput, requestCmuEmailSchema, UpdateProfileInput, updateProfileSchema,
  VerifyCmuEmailInput, verifyCmuEmailSchema,
} from '@tembo/shared';
import { AuthGuard, AuthUser, CurrentUser } from '../common/auth';
import { ZodPipe } from '../common/zod.pipe';
import { UsersService } from './users.service';

@Controller('me')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() u: AuthUser) {
    return this.users.me(u.id);
  }

  @Patch('profile')
  updateProfile(@CurrentUser() u: AuthUser, @Body(new ZodPipe(updateProfileSchema)) body: UpdateProfileInput) {
    return this.users.updateProfile(u.id, body);
  }

  @Post('cmu-email/request')
  @HttpCode(200)
  async requestCmu(@CurrentUser() u: AuthUser, @Body(new ZodPipe(requestCmuEmailSchema)) body: RequestCmuEmailInput) {
    await this.users.requestCmuVerification(u.id, body.cmuEmail);
    return { ok: true };
  }

  @Post('cmu-email/verify')
  @HttpCode(200)
  verifyCmu(@CurrentUser() u: AuthUser, @Body(new ZodPipe(verifyCmuEmailSchema)) body: VerifyCmuEmailInput) {
    return this.users.confirmCmuVerification(u.id, body.code);
  }

  @Get('wallet')
  wallet(@CurrentUser() u: AuthUser) {
    return this.users.wallet(u.id);
  }
}
