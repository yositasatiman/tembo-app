import { Body, Controller, Get, Header, HttpCode, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  CreateSurveyInput, createSurveySchema, ReviewSubsidyInput, reviewSubsidySchema,
  SponsorSurveyInput, sponsorSurveySchema, SubmitAnswersInput, submitAnswersSchema, VerifyExternalInput, verifyExternalSchema,
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
  list(@CurrentUser() u: AuthUser) { return this.surveys.list(u.id); }

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

  @Get(':id/form')
  form(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.surveys.form(id, u.id); }

  /** ส่งคำตอบ → ตรวจครบถ้วน → จ่ายรางวัลจาก Escrow */
  @Post(':id/responses')
  @HttpCode(200)
  respond(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(submitAnswersSchema)) body: SubmitAnswersInput) {
    return this.surveys.recordResponse(u.id, id, body.answers);
  }

  /** แบบสอบถามลิงก์ภายนอก: บันทึกเวลาเริ่มแล้วคืนลิงก์ */
  @Post(':id/start')
  @HttpCode(200)
  start(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.surveys.startExternal(u.id, id); }

  /** แบบสอบถามลิงก์ภายนอก: กรอกรหัสยืนยันจากหน้าสุดท้ายของฟอร์ม → รับ Coin */
  @Post(':id/verify')
  @HttpCode(200)
  verify(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(verifyExternalSchema)) body: VerifyExternalInput) {
    return this.surveys.verifyExternal(u.id, id, body.code);
  }

  @Get(':id/results')
  results(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.surveys.results(id, u); }

  @Get(':id/results.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async csv(@CurrentUser() u: AuthUser, @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const { filename, content } = await this.surveys.csv(id, u);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return content;
  }
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
