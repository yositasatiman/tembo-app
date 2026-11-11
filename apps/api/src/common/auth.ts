import {
  CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable,
  SetMetadata, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export const ACCESS_COOKIE = 'tembo_at';
export const REFRESH_COOKIE = 'tembo_rt';

export interface AuthUser { id: string; role: 'MEMBER' | 'ADMIN' }

/** ต้องล็อกอิน: ตรวจ access token จาก HttpOnly cookie */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = req.cookies?.[ACCESS_COOKIE];
    if (!token) throw new UnauthorizedException('กรุณาเข้าสู่ระบบ');
    try {
      const p = await this.jwt.verifyAsync<{ sub: string; role: AuthUser['role'] }>(token);
      req.user = { id: p.sub, role: p.role };
      return true;
    } catch {
      throw new UnauthorizedException('เซสชันหมดอายุ');
    }
  }
}

export const ROLES_KEY = 'roles';
export const Roles = (...roles: AuthUser['role'][]) => SetMetadata(ROLES_KEY, roles);

/** ใช้คู่กับ AuthGuard: @UseGuards(AuthGuard, RolesGuard) @Roles('ADMIN') */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<AuthUser['role'][]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!roles?.length) return true;
    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user || !roles.includes(user.role)) throw new ForbiddenException('ไม่มีสิทธิ์');
    return true;
  }
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<{ user: AuthUser }>().user;
});
