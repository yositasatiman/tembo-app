import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Injectable, NotFoundException, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Prisma } from '@tembo/db';
import { bi, DRAFT_RULES, DraftDetail, DraftSummary, saveDraftSchema } from '@tembo/shared';
import type { z } from 'zod';
import { AuthGuard, AuthUser, CurrentUser } from '../common/auth';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

type DraftInput = z.output<typeof saveDraftSchema>;

/** ฉบับร่างแบบสอบถาม — เก็บบนเซิร์ฟเวอร์เพื่อให้เปิดต่อได้ทุกเครื่อง และแสดงใน "แบบสอบถามของฉัน" */
@Injectable()
export class DraftsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerId: string): Promise<DraftSummary[]> {
    const rows = await this.prisma.surveyDraft.findMany({ where: { ownerId }, orderBy: { updatedAt: 'desc' }, take: DRAFT_RULES.MAX_PER_USER });
    return rows.map((d) => this.summary(d));
  }

  async get(ownerId: string, id: string): Promise<DraftDetail> {
    const d = await this.own(ownerId, id);
    return { ...this.summary(d), data: d.data as Record<string, unknown> };
  }

  async create(ownerId: string, input: DraftInput) {
    if ((await this.prisma.surveyDraft.count({ where: { ownerId } })) >= DRAFT_RULES.MAX_PER_USER) {
      throw new BadRequestException(bi(`You can keep up to ${DRAFT_RULES.MAX_PER_USER} drafts. Delete an old one first.`, `เก็บฉบับร่างได้สูงสุด ${DRAFT_RULES.MAX_PER_USER} ฉบับ ลบฉบับเก่าก่อน`));
    }
    this.checkSize(input);
    const d = await this.prisma.surveyDraft.create({ data: { ownerId, title: input.title, stepsDone: input.stepsDone, data: input.data as Prisma.InputJsonObject } });
    return this.summary(d);
  }

  async update(ownerId: string, id: string, input: DraftInput) {
    await this.own(ownerId, id);
    this.checkSize(input);
    const d = await this.prisma.surveyDraft.update({ where: { id }, data: { title: input.title, stepsDone: input.stepsDone, data: input.data as Prisma.InputJsonObject } });
    return this.summary(d);
  }

  async remove(ownerId: string, id: string) {
    await this.own(ownerId, id);
    await this.prisma.surveyDraft.delete({ where: { id } });
    return { ok: true };
  }

  private async own(ownerId: string, id: string) {
    const d = await this.prisma.surveyDraft.findUnique({ where: { id } });
    if (!d || d.ownerId !== ownerId) throw new NotFoundException(bi('Draft not found', 'ไม่พบฉบับร่างนี้'));
    return d;
  }

  private checkSize(input: DraftInput) {
    if (JSON.stringify(input.data).length > DRAFT_RULES.MAX_BYTES) throw new BadRequestException(bi('Draft is too large', 'ฉบับร่างมีขนาดใหญ่เกินไป'));
  }

  private summary(d: { id: string; title: string; stepsDone: number; updatedAt: Date }): DraftSummary {
    return { id: d.id, title: d.title, stepsDone: d.stepsDone, updatedAt: d.updatedAt.toISOString() };
  }
}

@Controller('survey-drafts')
@UseGuards(AuthGuard)
export class DraftsController {
  constructor(private readonly drafts: DraftsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) { return this.drafts.list(u.id); }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.drafts.get(u.id, id); }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(saveDraftSchema)) body: DraftInput) { return this.drafts.create(u.id, body); }

  @Put(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(saveDraftSchema)) body: DraftInput) { return this.drafts.update(u.id, id, body); }

  @Delete(':id')
  @HttpCode(200)
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.drafts.remove(u.id, id); }
}
