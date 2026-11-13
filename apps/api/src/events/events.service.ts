import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger,
  NotFoundException, OnModuleDestroy, OnModuleInit,
} from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Prisma, SYSTEM_WALLETS } from '@tembo/db';
import {
  CheckInCodeResponse, CheckInResponse, CreateEventInput, EVENT_RULES, EventAttendee, EventDetail,
  EventFilter, EventSummary, quoteEvent,
} from '@tembo/shared';
import type { AuthUser } from '../common/auth';
import { config } from '../config';
import { LedgerService, Tx } from '../ledger/ledger.service';
import { PrismaService } from '../prisma/prisma.service';

const MIN = 60_000;
/** ตัวอักษรของรหัสเช็กอิน — ไม่มี 0/O/1/I เพื่อกันอ่านผิด */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const eventInclude = (viewerId: string) => ({
  escrowWallet: { select: { balance: true } },
  registrations: { where: { userId: viewerId }, select: { status: true, checkedInAt: true, reward: true, createdAt: true } },
}) satisfies Prisma.EventInclude;
type EventRow = Prisma.EventGetPayload<{ include: ReturnType<typeof eventInclude> }>;

const checkInWindow = (e: { startsAt: Date; endsAt: Date }) => ({
  opensAt: new Date(e.startsAt.getTime() - EVENT_RULES.CHECKIN_OPENS_BEFORE_MIN * MIN),
  closesAt: new Date(e.endsAt.getTime() + EVENT_RULES.CHECKIN_CLOSES_AFTER_MIN * MIN),
});

const initials = (name: string | null) => (name ?? '?').trim().split(/\s+/).map((w) => [...w][0] ?? '').slice(0, 2).join('').toUpperCase() || '?';

/**
 * Event ในมหาวิทยาลัย (docs/coin-rules.md หัวข้อ Event)
 * - สร้าง → ล็อกค่าโพสต์ + Coin รางวัลไว้ใน Escrow → รอแอดมินอนุมัติ
 * - อนุมัติ → ค่าโพสต์เข้า SYSTEM_BURN / ไม่อนุมัติ → คืนทั้งหมด
 * - ลงทะเบียนในแอป (เต็มแล้วเข้าคิวรอ) และถ้ามีลิงก์ฟอร์มของผู้จัด ผู้ใช้กรอกต่อเอง
 * - เช็กอินด้วยรหัสที่เปลี่ยนทุกนาที (ผู้จัดเปิด QR ที่หน้างาน) → รับ Coin รางวัลจาก Escrow
 * - จบงาน/ยกเลิก → คืน Coin รางวัลที่เหลือให้ผู้จัด
 */
@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(EventsService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService, private readonly ledger: LedgerService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      this.sweep().catch((e) => this.log.error('event sweep failed', e));
    }, 60_000);
  }
  onModuleDestroy() { clearInterval(this.timer); }

  // ───────────── สร้าง ─────────────

  async create(userId: string, input: CreateEventInput): Promise<EventDetail> {
    const q = quoteEvent(input);
    const id = await this.prisma.$transaction(async (tx) => {
      const escrow = await tx.wallet.create({ data: { kind: 'ESCROW' } });
      const event = await tx.event.create({
        data: {
          organizerId: userId,
          title: input.title,
          description: input.description,
          hostName: input.hostName,
          category: input.category,
          tags: [...new Set(input.tags)],
          coverUrl: input.coverUrl || null,
          location: input.location,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          capacity: input.capacity,
          registrationUrl: input.registrationUrl || null,
          rewardPerCheckIn: input.rewardPerCheckIn,
          rewardSlots: input.rewardPerCheckIn > 0 ? input.rewardSlots : 0,
          postFee: q.postFee,
          status: 'PENDING_REVIEW',
          escrowWalletId: escrow.id,
          checkInSecret: randomBytes(32).toString('hex'),
        },
      });
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      await this.ledger.post(tx, {
        type: 'ESCROW_FUND', idempotencyKey: `event:${event.id}:fund`,
        memo: `ค่าโพสต์${q.rewardPool ? ' + Coin รางวัล' : ''} Event "${event.title}" (พักไว้รอแอดมินตรวจ)`,
        entries: [{ walletId: wallet.id, delta: -q.total }, { walletId: escrow.id, delta: q.total }],
      });
      return event.id;
    });
    return this.detail(id, { id: userId, role: 'MEMBER' });
  }

  // ───────────── ล็อก ─────────────

  private async lock(tx: Tx, id: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Event" WHERE id = ${id} FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('ไม่พบ Event');
    return tx.event.findUniqueOrThrow({ where: { id }, include: { escrowWallet: { select: { balance: true } } } });
  }

  /** คืน Coin ทั้งหมดที่เหลือใน Escrow ให้ผู้จัด (ต้องล็อกแถว Event แล้ว) */
  private async refundEscrow(tx: Tx, e: { id: string; title: string; organizerId: string; escrowWalletId: string }, reason: string) {
    const escrow = await tx.wallet.findUniqueOrThrow({ where: { id: e.escrowWalletId } });
    if (escrow.balance <= 0) return 0;
    const owner = await tx.wallet.findUniqueOrThrow({ where: { userId: e.organizerId } });
    await this.ledger.post(tx, {
      type: 'ESCROW_REFUND', idempotencyKey: `event:${e.id}:refund`, memo: `คืน Coin จาก Event "${e.title}" (${reason})`,
      entries: [{ walletId: e.escrowWalletId, delta: -escrow.balance }, { walletId: owner.id, delta: escrow.balance }],
    });
    return escrow.balance;
  }

  // ───────────── แอดมิน ─────────────

  async pendingReview() {
    const rows = await this.prisma.event.findMany({
      where: { status: 'PENDING_REVIEW' },
      orderBy: { createdAt: 'asc' },
      include: { organizer: { select: { displayName: true, email: true, cmuEmail: true, faculty: true } } },
    });
    return rows.map((e) => ({
      id: e.id, title: e.title, description: e.description, hostName: e.hostName, category: e.category, location: e.location,
      startsAt: e.startsAt, endsAt: e.endsAt, capacity: e.capacity, registrationUrl: e.registrationUrl, coverUrl: e.coverUrl,
      rewardPerCheckIn: e.rewardPerCheckIn, rewardSlots: e.rewardSlots, createdAt: e.createdAt, organizer: e.organizer,
    }));
  }

  async review(adminId: string, id: string, approve: boolean, note?: string) {
    await this.prisma.$transaction(async (tx) => {
      const e = await this.lock(tx, id);
      if (e.status !== 'PENDING_REVIEW') throw new ConflictException('Event นี้ไม่ได้รอการตรวจ');
      if (approve) {
        if (e.endsAt <= new Date()) throw new BadRequestException('Event นี้จบไปแล้ว อนุมัติไม่ได้');
        await this.ledger.post(tx, {
          type: 'POST_FEE', idempotencyKey: `event:${id}:fee`, memo: `ค่าโพสต์ Event "${e.title}"`,
          entries: [{ walletId: e.escrowWalletId, delta: -e.postFee }, { walletId: SYSTEM_WALLETS.BURN, delta: e.postFee }],
        });
      } else {
        await this.refundEscrow(tx, e, 'แอดมินไม่อนุมัติ');
      }
      await tx.event.update({
        where: { id },
        data: { status: approve ? 'PUBLISHED' : 'REJECTED', reviewNote: note || null, reviewedAt: new Date() },
      });
      this.log.log(`event ${approve ? 'approved' : 'rejected'} event=${id} by admin=${adminId}`);
    });
  }

  // ───────────── ผู้จัดยกเลิก / จบงาน ─────────────

  async cancelByOrganizer(userId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const e = await this.lock(tx, id);
      if (e.organizerId !== userId) throw new ForbiddenException('เฉพาะผู้จัดที่ยกเลิก Event ได้');
      if (e.status !== 'PENDING_REVIEW' && e.status !== 'PUBLISHED') throw new BadRequestException('Event นี้ยกเลิกไม่ได้แล้ว');
      // ยกเลิกก่อนแอดมินตรวจ = ค่าโพสต์ยังอยู่ใน Escrow → คืนทั้งหมด / หลังอนุมัติ ค่าโพสต์ไม่คืน
      await this.refundEscrow(tx, e, 'ผู้จัดยกเลิก');
      await tx.event.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    });
    return this.detail(id, { id: userId, role: 'MEMBER' });
  }

  /**
   * เรียกทุก 1 นาที:
   * - Event ที่พ้นช่วงเช็กอินแล้ว → ENDED + คืน Coin รางวัลที่เหลือ
   * - Event ที่ถึงเวลาเริ่มแต่แอดมินยังไม่ตรวจ → REJECTED + คืนทั้งหมด
   */
  async sweep(now = new Date()) {
    const closeBefore = new Date(now.getTime() - EVENT_RULES.CHECKIN_CLOSES_AFTER_MIN * MIN);
    const due = await this.prisma.event.findMany({
      where: { OR: [{ status: 'PUBLISHED', endsAt: { lte: closeBefore } }, { status: 'PENDING_REVIEW', startsAt: { lte: now } }] },
      select: { id: true }, take: 100,
    });
    for (const { id } of due) {
      await this.prisma.$transaction(async (tx) => {
        const e = await this.lock(tx, id);
        if (e.status === 'PUBLISHED' && e.endsAt <= closeBefore) {
          await this.refundEscrow(tx, e, 'จบงาน');
          await tx.event.update({ where: { id }, data: { status: 'ENDED', endedAt: now } });
        } else if (e.status === 'PENDING_REVIEW' && e.startsAt <= now) {
          await this.refundEscrow(tx, e, 'ถึงเวลาเริ่มก่อนแอดมินตรวจ');
          await tx.event.update({ where: { id }, data: { status: 'REJECTED', reviewNote: 'ถึงเวลาเริ่มงานก่อนแอดมินตรวจ', reviewedAt: now } });
        }
      });
    }
    return due.length;
  }

  // ───────────── ลงทะเบียน ─────────────

  private registerBlockedReason(e: { status: string; endsAt: Date; organizerId: string }, userId: string) {
    if (e.organizerId === userId) return 'คุณเป็นผู้จัด Event นี้';
    if (e.status === 'PENDING_REVIEW') return 'Event นี้ยังรอแอดมินตรวจ';
    if (e.status === 'CANCELLED') return 'Event นี้ถูกยกเลิกแล้ว';
    if (e.status !== 'PUBLISHED' || e.endsAt <= new Date()) return 'Event นี้จบไปแล้ว';
    return null;
  }

  async register(userId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const e = await this.lock(tx, id);
      // Event ที่ยังไม่ผ่านการตรวจ คนอื่นมองไม่เห็น
      if ((e.status === 'PENDING_REVIEW' || e.status === 'REJECTED') && e.organizerId !== userId) throw new NotFoundException('ไม่พบ Event');
      const blocked = this.registerBlockedReason(e, userId);
      if (blocked) throw new BadRequestException(blocked);
      const existing = await tx.eventRegistration.findUnique({ where: { eventId_userId: { eventId: id, userId } } });
      if (existing && existing.status !== 'CANCELLED') throw new ConflictException('คุณลงทะเบียน Event นี้แล้ว');
      const full = e.capacity !== null && e.registeredCount >= e.capacity;
      const status = full ? 'WAITLISTED' : 'REGISTERED';
      if (existing) {
        // ลงใหม่หลังยกเลิก = ต่อท้ายคิว (createdAt ใหม่)
        await tx.eventRegistration.update({ where: { id: existing.id }, data: { status, createdAt: new Date() } });
      } else {
        await tx.eventRegistration.create({ data: { eventId: id, userId, status } });
      }
      if (!full) await tx.event.update({ where: { id }, data: { registeredCount: { increment: 1 } } });
      // ถ้าเคยซ่อนไว้ ให้กลับมาแสดง
      await tx.eventHide.deleteMany({ where: { eventId: id, userId } });
    });
    return this.detail(id, { id: userId, role: 'MEMBER' });
  }

  async unregister(userId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const e = await this.lock(tx, id);
      const reg = await tx.eventRegistration.findUnique({ where: { eventId_userId: { eventId: id, userId } } });
      if (!reg || reg.status === 'CANCELLED') throw new BadRequestException('คุณยังไม่ได้ลงทะเบียน Event นี้');
      if (reg.checkedInAt) throw new BadRequestException('เช็กอินแล้ว ยกเลิกการลงทะเบียนไม่ได้');
      await tx.eventRegistration.update({ where: { id: reg.id }, data: { status: 'CANCELLED' } });
      if (reg.status !== 'REGISTERED') return;
      // ที่ว่าง 1 ที่ → เลื่อนคนแรกในคิวขึ้นมา (ถ้า Event ยังเปิดอยู่)
      const next = e.status === 'PUBLISHED' && e.endsAt > new Date()
        ? await tx.eventRegistration.findFirst({ where: { eventId: id, status: 'WAITLISTED' }, orderBy: { createdAt: 'asc' } })
        : null;
      if (next) await tx.eventRegistration.update({ where: { id: next.id }, data: { status: 'REGISTERED' } });
      else await tx.event.update({ where: { id }, data: { registeredCount: { decrement: 1 } } });
    });
    return this.detail(id, { id: userId, role: 'MEMBER' });
  }

  async hide(userId: string, id: string) {
    const e = await this.prisma.event.findUnique({ where: { id }, select: { organizerId: true } });
    if (!e) throw new NotFoundException('ไม่พบ Event');
    const reg = await this.prisma.eventRegistration.findUnique({ where: { eventId_userId: { eventId: id, userId } } });
    if (reg && reg.status !== 'CANCELLED') throw new BadRequestException('ยกเลิกการลงทะเบียนก่อน จึงจะซ่อน Event นี้ได้');
    await this.prisma.eventHide.upsert({ where: { eventId_userId: { eventId: id, userId } }, create: { eventId: id, userId }, update: {} });
    return { ok: true };
  }

  async unhide(userId: string, id: string) {
    await this.prisma.eventHide.deleteMany({ where: { eventId: id, userId } });
    return { ok: true };
  }

  // ───────────── เช็กอิน ─────────────

  private codeFor(secret: string, eventId: string, slot: number) {
    const mac = createHmac('sha256', secret).update(`${eventId}:${slot}`).digest();
    let code = '';
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[mac[i] % CODE_ALPHABET.length];
    return code;
  }

  private slot(now = Date.now()) { return Math.floor(now / (EVENT_RULES.CHECKIN_CODE_SECONDS * 1000)); }

  /** รหัสปัจจุบันสำหรับผู้จัดเปิดเป็น QR ที่หน้างาน */
  async checkInCode(userId: string, id: string): Promise<CheckInCodeResponse> {
    const e = await this.prisma.event.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('ไม่พบ Event');
    if (e.organizerId !== userId) throw new ForbiddenException('เฉพาะผู้จัดที่เปิดรหัสเช็กอินได้');
    if (e.status !== 'PUBLISHED') throw new BadRequestException('Event นี้ไม่ได้เปิดอยู่');
    const w = checkInWindow(e);
    const now = Date.now();
    if (now < w.opensAt.getTime()) throw new BadRequestException(`เปิดเช็กอินได้ตั้งแต่ ${EVENT_RULES.CHECKIN_OPENS_BEFORE_MIN} นาทีก่อนเริ่มงาน`);
    if (now > w.closesAt.getTime()) throw new BadRequestException('หมดช่วงเช็กอินแล้ว');
    const s = this.slot(now);
    const code = this.codeFor(e.checkInSecret, e.id, s);
    const period = EVENT_RULES.CHECKIN_CODE_SECONDS;
    return {
      code,
      expiresInSec: period - Math.floor((now / 1000) % period),
      checkInUrl: `${config.webOrigin}/events/${e.id}/checkin?code=${code}`,
    };
  }

  private codeMatches(secret: string, eventId: string, input: string) {
    const s = this.slot();
    const given = Buffer.from(input);
    return [s, s - 1].some((slot) => {
      const expected = Buffer.from(this.codeFor(secret, eventId, slot));
      return expected.length === given.length && timingSafeEqual(expected, given);
    });
  }

  async checkIn(userId: string, id: string, code: string): Promise<CheckInResponse> {
    return this.prisma.$transaction(async (tx) => {
      const e = await this.lock(tx, id);
      if (e.status !== 'PUBLISHED') throw new BadRequestException('Event นี้ไม่ได้เปิดอยู่');
      const w = checkInWindow(e);
      const now = new Date();
      if (now < w.opensAt) throw new BadRequestException('ยังไม่ถึงเวลาเช็กอิน');
      if (now > w.closesAt) throw new BadRequestException('หมดช่วงเช็กอินแล้ว');
      if (!this.codeMatches(e.checkInSecret, e.id, code)) throw new BadRequestException('รหัสเช็กอินไม่ถูกต้องหรือหมดอายุ ให้สแกน QR ใหม่อีกครั้ง');
      const reg = await tx.eventRegistration.findUnique({ where: { eventId_userId: { eventId: id, userId } } });
      if (!reg || reg.status === 'CANCELLED') throw new BadRequestException('คุณยังไม่ได้ลงทะเบียน Event นี้');
      if (reg.status === 'WAITLISTED') throw new BadRequestException('คุณยังอยู่ในคิวรอ ยังเช็กอินไม่ได้');
      if (reg.checkedInAt) throw new ConflictException('คุณเช็กอินไปแล้ว');

      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      let reward = 0;
      let note: string | null = null;
      if (e.rewardPerCheckIn > 0) {
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { cmuVerifiedAt: true } });
        if (!user.cmuVerifiedAt) note = 'เช็กอินแล้ว แต่ยังไม่ได้รับ Coin เพราะยังไม่ได้ยืนยันอีเมล @cmu.ac.th';
        else if (e.rewardedCount >= e.rewardSlots || e.escrowWallet.balance < e.rewardPerCheckIn) note = 'เช็กอินแล้ว แต่ Coin รางวัลของงานนี้หมดแล้ว';
        else {
          await this.ledger.post(tx, {
            type: 'EVENT_REWARD', idempotencyKey: `event:${id}:checkin:${userId}`, memo: `รางวัลเช็กอิน Event "${e.title}"`,
            entries: [{ walletId: e.escrowWalletId, delta: -e.rewardPerCheckIn }, { walletId: wallet.id, delta: e.rewardPerCheckIn }],
          });
          reward = e.rewardPerCheckIn;
        }
      }
      const updated = await tx.eventRegistration.update({ where: { id: reg.id }, data: { checkedInAt: now, reward } });
      await tx.event.update({ where: { id }, data: { checkedInCount: { increment: 1 }, ...(reward ? { rewardedCount: { increment: 1 } } : {}) } });
      const after = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id }, select: { balance: true } });
      return { checkedInAt: updated.checkedInAt!.toISOString(), reward, balance: after.balance, note };
    });
  }

  // ───────────── อ่าน ─────────────

  private summary(e: EventRow, viewerId: string): EventSummary {
    const mine = e.registrations[0];
    const myStatus = mine?.status ?? null;
    return {
      id: e.id, title: e.title, hostName: e.hostName, category: e.category, tags: e.tags, coverUrl: e.coverUrl,
      location: e.location, startsAt: e.startsAt.toISOString(), endsAt: e.endsAt.toISOString(),
      capacity: e.capacity, registeredCount: e.registeredCount,
      isFull: e.capacity !== null && e.registeredCount >= e.capacity,
      rewardPerCheckIn: e.rewardPerCheckIn,
      rewardsLeft: e.rewardPerCheckIn > 0 ? Math.max(0, Math.min(e.rewardSlots - e.rewardedCount, Math.floor(e.escrowWallet.balance / e.rewardPerCheckIn))) : 0,
      status: e.status,
      isOrganizer: e.organizerId === viewerId,
      myStatus: myStatus === 'CANCELLED' ? null : myStatus,
      myCheckedIn: !!mine?.checkedInAt,
    };
  }

  async list(viewerId: string, filter: EventFilter = 'all', q?: string): Promise<EventSummary[]> {
    const search: Prisma.EventWhereInput = q?.trim()
      ? { OR: ['title', 'hostName', 'location', 'description'].map((f) => ({ [f]: { contains: q.trim(), mode: 'insensitive' } })) }
      : {};
    let where: Prisma.EventWhereInput;
    let orderBy: Prisma.EventOrderByWithRelationInput = { startsAt: 'asc' };
    if (filter === 'mine') {
      where = { AND: [search, { OR: [{ organizerId: viewerId }, { registrations: { some: { userId: viewerId, status: { not: 'CANCELLED' } } } }] }] };
      orderBy = { startsAt: 'desc' };
    } else {
      where = {
        AND: [search, {
          status: 'PUBLISHED',
          endsAt: { gt: new Date() },
          hides: { none: { userId: viewerId } },
          ...(filter !== 'all' ? { category: filter } : {}),
        }],
      };
    }
    const rows = await this.prisma.event.findMany({ where, orderBy, take: 50, include: eventInclude(viewerId) });
    return rows.map((e) => this.summary(e, viewerId));
  }

  async detail(id: string, viewer: AuthUser): Promise<EventDetail> {
    const e = await this.prisma.event.findUnique({
      where: { id },
      include: { ...eventInclude(viewer.id), organizer: { select: { cmuVerifiedAt: true } } },
    });
    if (!e) throw new NotFoundException('ไม่พบ Event');
    const isOrganizer = e.organizerId === viewer.id;
    if ((e.status === 'PENDING_REVIEW' || e.status === 'REJECTED') && !isOrganizer && viewer.role !== 'ADMIN') throw new NotFoundException('ไม่พบ Event');

    const [recent, waitlistCount, hidden] = await Promise.all([
      this.prisma.eventRegistration.findMany({
        where: { eventId: id, status: 'REGISTERED' }, orderBy: { createdAt: 'desc' }, take: 3,
        include: { user: { select: { displayName: true } } },
      }),
      this.prisma.eventRegistration.count({ where: { eventId: id, status: 'WAITLISTED' } }),
      this.prisma.eventHide.findUnique({ where: { eventId_userId: { eventId: id, userId: viewer.id } } }),
    ]);
    const mine = e.registrations[0];
    const myWaitlistPosition = mine?.status === 'WAITLISTED'
      ? (await this.prisma.eventRegistration.count({ where: { eventId: id, status: 'WAITLISTED', createdAt: { lte: mine.createdAt } } }))
      : null;
    const w = checkInWindow(e);
    const now = new Date();
    return {
      ...this.summary(e, viewer.id),
      description: e.description,
      registrationUrl: e.registrationUrl,
      organizerVerified: !!e.organizer.cmuVerifiedAt,
      checkedInCount: e.checkedInCount,
      waitlistCount,
      participantInitials: recent.map((r) => initials(r.user.displayName)),
      myWaitlistPosition,
      myReward: mine?.reward ?? 0,
      hidden: !!hidden,
      checkInOpen: e.status === 'PUBLISHED' && now >= w.opensAt && now <= w.closesAt,
      checkInOpensAt: w.opensAt.toISOString(),
      checkInClosesAt: w.closesAt.toISOString(),
      registerBlockedReason: this.registerBlockedReason(e, viewer.id),
      postFee: e.postFee,
      escrowBalance: isOrganizer || viewer.role === 'ADMIN' ? e.escrowWallet.balance : null,
      rewardSlots: e.rewardSlots,
      rewardedCount: e.rewardedCount,
      reviewNote: isOrganizer || viewer.role === 'ADMIN' ? e.reviewNote : null,
      createdAt: e.createdAt.toISOString(),
    };
  }

  /** รายชื่อผู้ลงทะเบียน — เฉพาะผู้จัด/แอดมิน */
  async attendees(id: string, viewer: AuthUser): Promise<EventAttendee[]> {
    const e = await this.prisma.event.findUnique({ where: { id }, select: { organizerId: true } });
    if (!e) throw new NotFoundException('ไม่พบ Event');
    if (e.organizerId !== viewer.id && viewer.role !== 'ADMIN') throw new ForbiddenException('เฉพาะผู้จัดที่ดูรายชื่อได้');
    const rows = await this.prisma.eventRegistration.findMany({
      where: { eventId: id, status: { not: 'CANCELLED' } },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      include: { user: { select: { displayName: true, faculty: true } } },
    });
    return rows.map((r) => ({
      name: r.user.displayName, faculty: r.user.faculty, status: r.status,
      checkedInAt: r.checkedInAt?.toISOString() ?? null, registeredAt: r.createdAt.toISOString(),
    }));
  }
}
