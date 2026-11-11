import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import {
  CreateSurveyInput, createSurveySchema, ReviewSubsidyInput, reviewSubsidySchema,
  SponsorSurveyInput, sponsorSurveySchema,
} from '@tembo/shared';
import { AuthGuard, AuthUser, CurrentUser, Roles, RolesGuard } from '../common/auth';
import { ZodPipe } from '../common/zod.pipe';
import { SurveysService } from './surveys.service';

@Controller('surveys')
@UseGuards(AuthGuard)
export class SurveysController {
  constructor(private readonly surveys: SurveysService) {}

  @Get('quote')
  quote(@CurrentUser() u: AuthUser) { return this.surveys.quoteInfo(u.id); }

  @Get()
  list() { return this.surveys.list(); }

  @Get('mine')
  mine(@CurrentUser() u: AuthUser) { return this.surveys.mine(u.id); }

  @Get(':id')
  detail(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.surveys.detail(id, u.id); }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(createSurveySchema)) body: CreateSurveyInput) {
    return this.surveys.create(u.id, body);
  }

  @Post(':id/sponsor')
  @HttpCode(200)
  sponsor(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(sponsorSurveySchema)) body: SponsorSurveyInput) {
    return this.surveys.sponsor(u.id, id, body.amount);
  }

  @Post(':id/close')
  @HttpCode(200)
  close(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.surveys.closeByOwner(u.id, id); }

  /** ขั้นที่ 2: ยืนยันว่าตอบครบแล้วรับรางวัล — ขั้นที่ 3 จะเปลี่ยนเป็นส่งคำตอบจริงมาด้วย */
  @Post(':id/responses')
  @HttpCode(200)
  respond(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.surveys.recordResponse(u.id, id); }
}

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly surveys: SurveysService) {}

  @Get('subsidies')
  pending() { return this.surveys.pendingSubsidies(); }

  @Post('surveys/:id/subsidy')
  @HttpCode(200)
  async review(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(reviewSubsidySchema)) body: ReviewSubsidyInput) {
    await this.surveys.reviewSubsidy(u.id, id, body.approve, body.note);
    return { ok: true };
  }
}
