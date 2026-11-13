import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { OtpService } from './auth/otp.service';
import { AuthGuard, RolesGuard } from './common/auth';
import { config } from './config';
import { AdminEventsController, EventsController } from './events/events.controller';
import { EventsService } from './events/events.service';
import { LedgerService } from './ledger/ledger.service';
import { MailService } from './mail/mail.service';
import { PrismaModule } from './prisma/prisma.service';
import { AdminController, SurveysController } from './surveys/surveys.controller';
import { SurveysService } from './surveys/surveys.service';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';

@Controller('health')
class HealthController {
  @Get() health() { return { ok: true }; }
}

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({ global: true, useFactory: () => ({ secret: config.jwtSecret }) }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
  ],
  controllers: [HealthController, AuthController, UsersController, SurveysController, AdminController, EventsController, AdminEventsController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    AuthGuard, RolesGuard, AuthService, OtpService, UsersService, LedgerService, MailService, SurveysService, EventsService,
  ],
})
export class AppModule {}
