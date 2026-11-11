import path from 'node:path';
import { createPrismaClient } from './client';
import { SYSTEM_WALLETS } from './system-wallets';

try { process.loadEnvFile(path.join(__dirname, '../../../.env')); } catch { /* ใช้ env ของระบบ */ }
const prisma = createPrismaClient();

async function main() {
  await prisma.wallet.upsert({ where: { id: SYSTEM_WALLETS.MINT }, update: {}, create: { id: SYSTEM_WALLETS.MINT, kind: 'SYSTEM_MINT' } });
  await prisma.wallet.upsert({ where: { id: SYSTEM_WALLETS.BURN }, update: {}, create: { id: SYSTEM_WALLETS.BURN, kind: 'SYSTEM_BURN' } });
  console.log('Seeded system wallets');
}

main().finally(() => prisma.$disconnect());
