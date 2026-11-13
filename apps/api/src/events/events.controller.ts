import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  CheckInInput, checkInSchema, CreateEventInput, createEventSchema, EVENT_FILTERS, EventFilter,
  ReviewEventInput, reviewEventSchema,
} from '@tembo/shared';
import { AuthGuard, AuthUser, CurrentUser, Roles, RolesGuard } from '../common/auth';
import { ZodPipe } from '../common/zod.pipe';
import { EventsService } from './events.service';

@Controller('events')
@UseGuards(AuthGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query('filter') filter?: string, @Query('q') q?: string) {
    const f = (EVENT_FILTERS as readonly string[]).includes(filter ?? '') ? (filter as EventFilter) : 'all';
    return this.events.list(u.id, f, q?.slice(0, 100));
  }

  @Get(':id')
  detail(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.events.detail(id, u); }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(createEventSchema)) body: CreateEventInput) {
    return this.events.create(u.id, body);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.events.cancelByOrganizer(u.id, id); }

  @Post(':id/register')
  @HttpCode(200)
  register(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.events.register(u.id, id); }

  @Delete(':id/register')
  unregister(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.events.unregister(u.id, id); }

  @Post(':id/hide')
  @HttpCode(200)
  hide(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.events.hide(u.id, id); }

  @Delete(':id/hide')
  unhide(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.events.unhide(u.id, id); }

  /** ผู้จัด: รหัสเช็กอินปัจจุบัน (เปลี่ยนทุกนาที) */
  @Get(':id/checkin-code')
  checkInCode(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.events.checkInCode(u.id, id); }

  @Post(':id/checkin')
  @HttpCode(200)
  checkIn(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(checkInSchema)) body: CheckInInput) {
    return this.events.checkIn(u.id, id, body.code);
  }

  @Get(':id/attendees')
  attendees(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.events.attendees(id, u); }
}

@Controller('admin/events')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminEventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  pending() { return this.events.pendingReview(); }

  @Post(':id/review')
  @HttpCode(200)
  async review(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(reviewEventSchema)) body: ReviewEventInput) {
    await this.events.review(u.id, id, body.approve, body.note);
    return { ok: true };
  }
}
