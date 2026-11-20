import { Controller, Get, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LangExceptionFilter, LangInterceptor } from './common/i18n';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { ClientThrottlerGuard } from './common/throttler';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { OtpService } from './auth/otp.service';
import { AuthGuard, RolesGuard } from './common/auth';
import { config } from './config';
import { AdminEventsController, EventsController } from './events/events.controller';
import { EventsService } from './events/events.service';
import { FeedController, FeedService } from './feed/feed';
import { NotificationsController, NotificationsService } from './notifications/notifications';
import { LedgerService } from './ledger/ledger.service';
import { MailService } from './mail/mail.service';
import { PrismaModule } from './prisma/prisma.service';
import { DraftsController, DraftsService } from './surveys/drafts';
import { AdminController, FormHookController, SurveysController } from './surveys/surveys.controller';
import { SurveysService } from './surveys/surveys.service';
import { AdminRewardsController, RewardsController, RewardsService } from './rewards/rewards';
import { AdminCoinsController, AdminCoinsService } from './users/admin-coins';
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
  controllers: [HealthController, AuthController, UsersController, SurveysController, AdminController, EventsController, AdminEventsController, FeedController, NotificationsController, RewardsController, AdminRewardsController, AdminCoinsController, FormHookController, DraftsController],
  providers: [
    { provide: APP_GUARD, useClass: ClientThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: LangInterceptor },
    { provide: APP_FILTER, useClass: LangExceptionFilter },
    AuthGuard, RolesGuard, AuthService, OtpService, UsersService, LedgerService, MailService, SurveysService, EventsService, FeedService, NotificationsService, RewardsService, AdminCoinsService, DraftsService,
  ],
})
export class AppModule {}
