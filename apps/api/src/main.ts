import 'reflect-metadata';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { config } from './config';

export function configureApp(app: { use: (...a: any[]) => any; enableCors: (o: object) => void }) {
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: config.webOrigin, credentials: true });
}

async function bootstrap() {
  // โหลด .env ที่รากของ monorepo (ถ้ามี)
  try { process.loadEnvFile(join(__dirname, '../../../.env')); } catch { /* ใช้ env ของระบบ */ }
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(config.port);
  console.log(`TEMBO API listening on http://localhost:${config.port}`);
}

if (require.main === module) bootstrap();
