# TEMBO

แพลตฟอร์มรวมแบบสอบถามงานวิจัยและกิจกรรม (Event) สำหรับนักศึกษามหาวิทยาลัยเชียงใหม่ ใช้ระบบ Coin หมุนเวียน (ไม่ใช่เงินจริง)

## สถานะ

- [x] **ขั้นที่ 1** — โครงโปรเจค, ฐานข้อมูล, สมัคร/ล็อกอินด้วยอีเมล + OTP, โปรไฟล์, ยืนยันอีเมล @cmu.ac.th, กระเป๋า Coin
- [x] **ขั้นที่ 2** — Escrow, ค่าโพสต์, ระบบสมทบ (แอดมินอนุมัติ), เพื่อนสนับสนุน, คืน Coin ตามสัดส่วน
- [x] **ขั้นที่ 3** — สร้างคำถาม 5 แบบ, แบบฟอร์มตอบ, สรุปผล และดาวน์โหลด CSV (ไม่เปิดเผยชื่อผู้ตอบ)
- [ ] ขั้นที่ 4 — Event + เช็กอินด้วย QR
- [ ] ขั้นที่ 5 — ฟีด, gamification, หน้าแอดมิน

กฎ Coin: [docs/coin-rules.md](docs/coin-rules.md)

## โครงสร้าง

```
apps/
  api/        NestJS 10 — REST API (พอร์ต 4000)
  web/        Next.js 15 + Tailwind v4 — หน้าเว็บ (พอร์ต 3000)
packages/
  db/         Prisma schema, migration, seed
  shared/     zod schema และค่าคงที่ที่ใช้ร่วมกันทั้ง api และ web
```

เว็บเรียก API ผ่าน `/api/*` (Next.js rewrite ไปที่ `API_URL`) เพื่อให้คุกกี้ล็อกอินเป็นแบบ first-party

## สิ่งที่ต้องมี

- Node.js 22+
- pnpm 10 (`corepack enable` แล้วจะได้ pnpm ตามที่โปรเจคกำหนด)
- Docker Desktop (สำหรับ PostgreSQL) หรือ PostgreSQL 16 ที่ติดตั้งเอง

## วิธีรันบนเครื่อง

**Windows แบบง่าย:** เปิด Docker Desktop ไว้ แล้วดับเบิลคลิก `dev-windows.cmd` สคริปต์จะติดตั้ง ตั้งค่า `.env` เตรียมฐานข้อมูล และเปิดเว็บให้เอง

**แบบพิมพ์คำสั่งเอง:**

```bash
# 1. เปิดฐานข้อมูล
docker compose up -d

# 2. ตั้งค่า env (Windows PowerShell ใช้: copy .env.example .env)
cp .env.example .env
#    แล้วเปลี่ยน JWT_SECRET และ OTP_SECRET เป็นค่าสุ่มยาว ๆ

# 3. ติดตั้งและเตรียมฐานข้อมูล
pnpm install
pnpm build:packages
pnpm db:deploy
pnpm db:seed

# 4. รัน (เปิด 2 terminal)
pnpm dev:api
pnpm dev:web
```

เปิด http://localhost:3000 แล้วล็อกอินด้วยอีเมลอะไรก็ได้
ถ้ายังไม่ได้ใส่ `RESEND_API_KEY` ระบบจะ **พิมพ์รหัส OTP ไว้ใน terminal ของ API** (บรรทัด `[DEV MAIL]`) แทนการส่งอีเมลจริง

### อัปเดตหลังดึงโค้ดใหม่ (git pull)

ปิดหน้าต่าง TEMBO API และ TEMBO Web แล้วดับเบิลคลิก `dev-windows.cmd` อีกครั้ง สคริปต์จะติดตั้งแพ็กเกจและอัปเดตฐานข้อมูลให้

### ส่งอีเมลจริง

สมัคร [Resend](https://resend.com) แล้วใส่ `RESEND_API_KEY` ใน `.env`
ถ้ายังไม่ได้ยืนยันโดเมน `MAIL_FROM` ต้องเป็น `onboarding@resend.dev` และส่งได้เฉพาะอีเมลของเจ้าของบัญชี Resend

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
|---|---|
| `pnpm test` | รันเทสต์ของ API (ต้องเปิดฐานข้อมูลไว้ — **เทสต์จะล้างข้อมูลในฐานข้อมูล**) |
| `pnpm db:make-admin you@example.com` | ตั้งบัญชีเป็นแอดมิน (ต้องล็อกอินเว็บมาก่อน 1 ครั้ง แล้วออกจากระบบ/เข้าใหม่) |
| `pnpm db:migrate` | สร้าง migration ใหม่หลังแก้ `packages/db/prisma/schema.prisma` |
| `pnpm build` | build ทุกส่วน |
| `pnpm typecheck` | ตรวจ type ทุก package |

ถ้าจะรันเทสต์โดยไม่ให้ข้อมูลที่ใช้ dev หาย ให้สร้างฐานข้อมูลแยก แล้วตั้ง `DATABASE_URL` ชี้ไปที่ฐานนั้นตอนรันเทสต์

## ความปลอดภัยที่ทำไว้แล้ว

- OTP เก็บแบบ HMAC-SHA256 ไม่เก็บรหัสจริง หมดอายุ 10 นาที ผิดได้ 5 ครั้ง ขอใหม่ได้ทุก 60 วินาที และไม่เกิน 5 ครั้ง/ชั่วโมง
- Access token อายุ 15 นาที, refresh token อายุ 30 วัน เก็บใน HttpOnly cookie และหมุนใหม่ทุกครั้ง ถ้ามีคนเอา refresh token เก่ามาใช้ซ้ำหลังผ่านไปเกิน 30 วินาที ระบบจะตัดทุก session ของบัญชีนั้น (ภายใน 30 วินาทีถือว่าเป็นหลายแท็บ refresh พร้อมกัน)
- จำกัดจำนวนคำขอ (rate limit), helmet, CORS เฉพาะ origin ของเว็บ
- กระเป๋า Coin ใช้ ledger แบบบัญชีคู่ ล็อกแถวด้วย `SELECT … FOR UPDATE` กันการตัด Coin ซ้อนกัน มีเทสต์ยิงพร้อมกัน 30 คำขอยืนยันว่ายอดไม่ติดลบ

## หมายเหตุ Prisma

Prisma Client ใช้ `engineType = "client"` + `@prisma/adapter-pg` (ไม่ต้องใช้ Rust query engine ตอนรัน)
ถ้าเครื่องไหนดาวน์โหลด binary ของ Prisma ไม่ได้ (เช่น อยู่หลัง proxy) ให้ตั้ง `PRISMA_JS_ENGINE=1` ก่อนรันคำสั่ง `prisma` เพื่อใช้ schema engine แบบ WASM แทน
