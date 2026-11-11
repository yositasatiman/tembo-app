import path from 'node:path';
import { defineConfig } from 'prisma/config';
import { PrismaPg } from '@prisma/adapter-pg';

// โหลด .env ที่รากของ monorepo (ถ้ามี)
try { process.loadEnvFile(path.join(__dirname, '../../.env')); } catch { /* ใช้ env ของระบบ */ }

const base = {
  schema: path.join('prisma', 'schema.prisma'),
  migrations: { path: path.join('prisma', 'migrations'), seed: 'node dist/seed.js' },
};

// ปกติใช้ schema engine แบบ binary (ดาวน์โหลดอัตโนมัติ)
// ถ้าเครื่องดาวน์โหลด binary ของ Prisma ไม่ได้ ให้ตั้ง PRISMA_JS_ENGINE=1 เพื่อใช้ตัว WASM แทน
export default process.env.PRISMA_JS_ENGINE === '1'
  ? defineConfig({
      ...base,
      experimental: { adapter: true },
      engine: 'js',
      adapter: async () => new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
    })
  : defineConfig(base);
