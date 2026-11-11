import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/** ตรวจ body ด้วย zod schema ชุดเดียวกับที่หน้าเว็บใช้ (@tembo/shared) */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}
  transform(value: unknown): T {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException({
        message: r.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง',
        issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return r.data;
  }
}
