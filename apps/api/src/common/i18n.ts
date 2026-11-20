import { AsyncLocalStorage } from 'node:async_hooks';
import { ArgumentsHost, CallHandler, Catch, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { asLang, Lang, LANG_COOKIE, pickDeep } from '@tembo/shared';
import type { NextFunction, Request, Response } from 'express';
import { map } from 'rxjs';

/** ภาษาของคำขอ: cookie tembo_lang (เว็บตั้งให้) → ค่าเริ่มต้นอังกฤษ */
export const langOf = (req: Request): Lang => asLang(req.cookies?.[LANG_COOKIE]);

const store = new AsyncLocalStorage<Lang>();
/** middleware (หลัง cookie-parser): จำภาษาของคำขอไว้ใช้ที่อื่น เช่น อีเมล OTP */
export const langMiddleware = (req: Request, _res: Response, next: NextFunction) => store.run(langOf(req), next);
/** ภาษาของคำขอปัจจุบัน (นอกคำขอ = อังกฤษ) */
export const currentLang = (): Lang => store.getStore() ?? 'en';

/** เลือกภาษาให้ข้อความ bi() ทุกตัวในผลลัพธ์ (แจ้งเตือน, memo, ป้าย ฯลฯ) */
@Injectable()
export class LangInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const lang = langOf(ctx.switchToHttp().getRequest<Request>());
    return next.handle().pipe(map((body) => pickDeep(body, lang)));
  }
}

/** เลือกภาษาให้ข้อความ error */
@Catch()
export class LangExceptionFilter extends BaseExceptionFilter {
  catch(err: unknown, host: ArgumentsHost) {
    if (err instanceof HttpException) {
      const http = host.switchToHttp();
      const body = err.getResponse();
      const lang = langOf(http.getRequest<Request>());
      http.getResponse<Response>().status(err.getStatus()).json(
        pickDeep(typeof body === 'string' ? { statusCode: err.getStatus(), message: body } : body, lang),
      );
      return;
    }
    super.catch(err, host);
  }
}
