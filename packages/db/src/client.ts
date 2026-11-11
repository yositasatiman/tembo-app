import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/** สร้าง PrismaClient ที่ต่อ PostgreSQL ผ่าน driver adapter (node-postgres) */
export function prismaOptions(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is not set');
  return { adapter: new PrismaPg({ connectionString: url }) };
}

export function createPrismaClient(url?: string) {
  return new PrismaClient(prismaOptions(url));
}
