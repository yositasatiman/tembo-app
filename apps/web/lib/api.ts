'use client';
import type { MeResponse } from '@tembo/shared';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** เรียก API ผ่าน /api (rewrite ไป NestJS) — ถ้า access token หมดอายุจะ refresh ให้อัตโนมัติ 1 ครั้ง */
export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    if (r.ok) return api<T>(path, init, false);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(body.message) ? body.message[0] : body.message;
    throw new ApiError(res.status, msg ?? 'เกิดข้อผิดพลาด');
  }
  return body as T;
}

export const post = <T,>(path: string, data?: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(data ?? {}) });
export const patch = <T,>(path: string, data: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(data) });
export const getMe = () => api<MeResponse>('/me');
