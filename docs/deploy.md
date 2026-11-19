# ขึ้นเซิร์ฟเวอร์จริงแบบฟรี (Vercel + Render + Neon + Gmail)

| ส่วน | ใช้ | แพ็กเกจฟรี (ตรวจเมื่อ พ.ย. 2569) |
|---|---|---|
| หน้าเว็บ (Next.js) | **Vercel** Hobby | ฟรี สำหรับงานส่วนตัว/ไม่ใช่เชิงพาณิชย์ |
| API (NestJS) | **Render** Free web service | 750 ชม./เดือน — **หลับหลังไม่มีคนใช้ 15 นาที ปลุกใช้เวลาราว 1 นาที** |
| ฐานข้อมูล | **Neon** Free | 0.5–1 GB ต่อโปรเจกต์, 100 CU-hours/เดือน |
| ส่ง OTP ทางอีเมล | **Gmail ผ่าน Google Apps Script** | ฟรี ~100 ผู้รับ/วัน (พอสำหรับทดสอบ) |

```
ผู้ใช้ ──► Vercel (หน้าเว็บ) ──/api/*──► Render (API) ──► Neon (PostgreSQL)
                                              └──► Apps Script ──► Gmail (ส่ง OTP)
```

หน้าเว็บส่งต่อ `/api/*` ไปที่ API เอง คุกกี้ล็อกอินจึงเป็นของโดเมน Vercel ไม่ต้องตั้ง CORS เพิ่ม

ต้องสมัคร 3 บัญชี: [Neon](https://neon.com), [Render](https://render.com), [Vercel](https://vercel.com) — ทั้ง Render และ Vercel ล็อกอินด้วย GitHub ได้

ทำตามลำดับ 1 → 6 (ประมาณ 30–45 นาที)

---

## 1. ส่งอีเมลด้วย Gmail (Apps Script)

Render แพ็กเกจฟรี**บล็อกพอร์ต SMTP** (25/465/587) จึงส่งผ่าน Gmail SMTP / App Password ไม่ได้ ใช้ Google Apps Script ส่งแทน (ทำงานผ่าน HTTPS)

1. ล็อกอิน Gmail ที่จะเป็นผู้ส่ง OTP แล้วเปิด https://script.google.com → **New project** → ตั้งชื่อ `TEMBO Mail`
2. ลบโค้ดเดิม วางโค้ดจาก [`docs/gmail-relay.gs`](gmail-relay.gs) → กด Save
3. เลือกฟังก์ชัน `testQuota` → กด **Run** → อนุญาตสิทธิ์ (Google อาจเตือนว่าแอปยังไม่ได้รับการตรวจสอบ → Advanced → Go to TEMBO Mail)
4. **Project Settings** (รูปเฟือง) → **Script Properties** → Add property ชื่อ `SECRET` ค่า = `MAIL_WEBHOOK_SECRET` จาก Render (ข้อ 3)
5. **Deploy → New deployment** → ประเภท **Web app** → Execute as: **Me** → Who has access: **Anyone** → Deploy
6. คัดลอก **Web app URL** (ลงท้าย `/exec`) — **นี่คือ `MAIL_WEBHOOK_URL`**

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
| `MAIL_WEBHOOK_URL` | Web app URL จากข้อ 1.6 |
| `MAIL_WEBHOOK_SECRET` | Render สุ่มให้เอง → คัดลอกไปใส่ Script Properties ในข้อ 1.4 |
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
| ล็อกอินแล้ว "ส่งอีเมลไม่สำเร็จ" | ดู Logs ใน Render บรรทัด `Mail webhook error` — `forbidden` = SECRET ไม่ตรงกัน, ได้หน้า HTML = ตั้ง Who has access ไม่ใช่ Anyone หรือ URL ไม่ได้ลงท้าย `/exec` |
| กดส่ง OTP แล้วค้าง "กำลังส่ง…" นาน | ยังใช้ SMTP อยู่ (Render ฟรีบล็อก) → ตั้ง `MAIL_WEBHOOK_URL` แทน |
| หน้าเว็บขึ้น 404/500 ตอนเรียก API | `API_URL` บน Vercel ผิด (ต้องขึ้นต้น `https://` ไม่มี `/` ท้าย) แก้แล้วต้อง **Redeploy** |
| Render build ล้มที่ `db:deploy` | `DATABASE_URL` ผิด หรือยังมี `channel_binding=require` |
| ล็อกอินแล้วเด้งกลับหน้าล็อกอิน | ต้องเปิดผ่าน URL ของ Vercel เท่านั้น ไม่ใช่ URL ของ Render |
| ไม่มีเมนูแอดมิน | อีเมลไม่ตรงกับ `ADMIN_EMAILS` — แก้แล้วออกจากระบบ/ล็อกอินใหม่ |

## ความปลอดภัย

- `JWT_SECRET` / `OTP_SECRET` Render สุ่มให้เอง ไม่ต้องตั้ง
- ห้ามใส่ MAIL_WEBHOOK_SECRET หรือ connection string ลงในโค้ดหรือ GitHub — ใส่ในหน้า Environment ของ Render/Vercel เท่านั้น
- แพ็กเกจฟรีของ Vercel ใช้ได้กับงานส่วนตัว/ไม่ใช่เชิงพาณิชย์ ถ้าจะเก็บเงินจริงต้องย้ายไปแพ็กเกจเสียเงิน
