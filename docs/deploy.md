# ขึ้นเซิร์ฟเวอร์จริงแบบฟรี (Vercel + Render + Neon + Gmail)

| ส่วน | ใช้ | แพ็กเกจฟรี (ตรวจเมื่อ พ.ย. 2569) |
|---|---|---|
| หน้าเว็บ (Next.js) | **Vercel** Hobby | ฟรี สำหรับงานส่วนตัว/ไม่ใช่เชิงพาณิชย์ |
| API (NestJS) | **Render** Free web service | 750 ชม./เดือน — **หลับหลังไม่มีคนใช้ 15 นาที ปลุกใช้เวลาราว 1 นาที** |
| ฐานข้อมูล | **Neon** Free | 0.5–1 GB ต่อโปรเจกต์, 100 CU-hours/เดือน |
| ส่ง OTP ทางอีเมล | **Gmail** + App Password | ฟรี มีเพดานจำนวนอีเมลต่อวัน (พอสำหรับทดสอบ) |

```
ผู้ใช้ ──► Vercel (หน้าเว็บ) ──/api/*──► Render (API) ──► Neon (PostgreSQL)
                                              └──► Gmail (ส่ง OTP)
```

หน้าเว็บส่งต่อ `/api/*` ไปที่ API เอง คุกกี้ล็อกอินจึงเป็นของโดเมน Vercel ไม่ต้องตั้ง CORS เพิ่ม

ต้องสมัคร 3 บัญชี: [Neon](https://neon.com), [Render](https://render.com), [Vercel](https://vercel.com) — ทั้ง Render และ Vercel ล็อกอินด้วย GitHub ได้

ทำตามลำดับ 1 → 6 (ประมาณ 30–45 นาที)

---

## 1. สร้าง App Password ของ Gmail

1. ใช้บัญชี Gmail ที่จะเป็นผู้ส่ง OTP (แนะนำสร้างบัญชีใหม่สำหรับ TEMBO)
2. เปิด https://myaccount.google.com/security → เปิด **การยืนยันแบบ 2 ขั้นตอน** (ต้องเปิดก่อน)
3. เปิด https://myaccount.google.com/apppasswords → ตั้งชื่อ `TEMBO` → กดสร้าง
4. คัดลอกรหัส 16 ตัวที่ได้ (เว้นวรรคไม่ต้องใส่) — **นี่คือ `SMTP_PASS`** เก็บไว้ อย่าส่งให้ใคร

## 2. สร้างฐานข้อมูลบน Neon

1. Neon → **New Project** → ชื่อ `tembo` → Region **AWS Asia Pacific (Singapore)** → Create
2. หน้า Dashboard → **Connect** → ปิดตัวเลือก **Connection pooling** → คัดลอก connection string
3. ลบ `&channel_binding=require` ออกท้ายลิงก์ (ถ้ามี) ให้เหลือแบบนี้ — **นี่คือ `DATABASE_URL`**

```
postgresql://neondb_owner:xxxx@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

## 3. ขึ้น API บน Render

1. Render → **New** → **Blueprint** → เชื่อม GitHub แล้วเลือก repo `tembo-app`
2. Render อ่าน `render.yaml` แล้วให้กรอกค่าเหล่านี้:

| ค่า | ใส่อะไร |
|---|---|
| `DATABASE_URL` | จากข้อ 2 |
| `WEB_ORIGIN` | ใส่ `https://example.com` ไปก่อน (แก้ในข้อ 5) |
| `SMTP_USER` | อีเมล Gmail จากข้อ 1 |
| `SMTP_PASS` | App Password 16 ตัว |
| `MAIL_FROM` | `TEMBO <อีเมล Gmail เดียวกัน>` |
| `ADMIN_EMAILS` | อีเมลที่จะใช้ล็อกอินเป็นแอดมิน (คั่นด้วย `,` ได้หลายอัน) |

3. กด **Apply** → รอ build ครั้งแรก 5–10 นาที (build จะสร้างตารางในฐานข้อมูลให้เอง)
4. เปิด URL ของ service เช่น `https://tembo-api-xxxx.onrender.com/health` ต้องเห็น `{"ok":true}`
5. คัดลอก URL นี้ (ไม่มี `/health`) — **นี่คือ `API_URL`**

## 4. ขึ้นหน้าเว็บบน Vercel

1. Vercel → **Add New… → Project** → Import repo `tembo-app`
2. **Root Directory** → กด Edit → เลือก `apps/web`
3. Framework Preset: **Next.js** (ปล่อยคำสั่ง build/install เป็นค่าเริ่มต้น — Vercel ใช้สคริปต์ `vercel-build` เอง)
4. **Environment Variables** → เพิ่ม `API_URL` = URL จากข้อ 3.5
5. กด **Deploy** → ได้ URL เช่น `https://tembo-app.vercel.app`

## 5. บอก API ว่าหน้าเว็บอยู่ที่ไหน

1. Render → service `tembo-api` → **Environment** → แก้ `WEB_ORIGIN` เป็น URL ของ Vercel จากข้อ 4.5
2. กด **Save, rebuild, and deploy**

ค่านี้ใช้สร้างลิงก์ใน QR เช็กอิน Event

## 6. ทดสอบ

1. เปิด URL ของ Vercel → ล็อกอินด้วยอีเมลที่ใส่ใน `ADMIN_EMAILS`
2. รหัส OTP ต้องเข้า **อีเมลจริง** (ถ้าไม่เจอให้ดูในสแปม)
3. เมนูบัญชี (รูปโปรไฟล์) ต้องมีปุ่ม **แอดมิน**

> ครั้งแรกหลัง API หลับ หน้าเว็บอาจค้าง "กำลังโหลด…" ราว 1 นาที หรือขึ้น error ให้รอแล้วรีเฟรช

---

## อัปเดตหลังแก้โค้ด

`git push` ขึ้น `main` แล้ว Render และ Vercel deploy ใหม่ให้อัตโนมัติ (migration ฐานข้อมูลรันใน build ของ Render)

## ไม่ให้ API หลับ (ไม่บังคับ)

สมัคร [cron-job.org](https://cron-job.org) (ฟรี) → สร้างงานเรียก `https://tembo-api-xxxx.onrender.com/health` **ทุก 14 นาที**
เหมาะช่วงให้เพื่อนทดสอบหรือวันนำเสนอ — เปิดตลอดเดือนใช้ราว 744 ชม. ยังอยู่ในโควตา 750 ชม. ของ Render (ถ้ามี service ฟรีอื่นใน workspace เดียวกันจะเกิน)

## ปัญหาที่เจอบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| ล็อกอินแล้ว "ส่งอีเมลไม่สำเร็จ" | `SMTP_PASS` ผิด หรือยังไม่เปิดยืนยัน 2 ขั้นตอน — ดู Logs ใน Render บรรทัด `SMTP error` |
| หน้าเว็บขึ้น 404/500 ตอนเรียก API | `API_URL` บน Vercel ผิด (ต้องขึ้นต้น `https://` ไม่มี `/` ท้าย) แก้แล้วต้อง **Redeploy** |
| Render build ล้มที่ `db:deploy` | `DATABASE_URL` ผิด หรือยังมี `channel_binding=require` |
| ล็อกอินแล้วเด้งกลับหน้าล็อกอิน | ต้องเปิดผ่าน URL ของ Vercel เท่านั้น ไม่ใช่ URL ของ Render |
| ไม่มีเมนูแอดมิน | อีเมลไม่ตรงกับ `ADMIN_EMAILS` — แก้แล้วออกจากระบบ/ล็อกอินใหม่ |

## ความปลอดภัย

- `JWT_SECRET` / `OTP_SECRET` Render สุ่มให้เอง ไม่ต้องตั้ง
- ห้ามใส่ App Password หรือ connection string ลงในโค้ดหรือ GitHub — ใส่ในหน้า Environment ของ Render/Vercel เท่านั้น
- แพ็กเกจฟรีของ Vercel ใช้ได้กับงานส่วนตัว/ไม่ใช่เชิงพาณิชย์ ถ้าจะเก็บเงินจริงต้องย้ายไปแพ็กเกจเสียเงิน
