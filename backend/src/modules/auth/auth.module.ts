import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AdminUser } from './admin-user.entity';
import { JwtStrategy } from './jwt.strategy';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Restaurant } from '../restaurant/restaurant.entity';
import { TokenBlacklistService } from './token-blacklist.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminUser, Restaurant]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET') || 'your-secret-key',
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES_IN') || '1d',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, TokenBlacklistService],
  // JwtModule is exported so other modules that already import AuthModule
  // (e.g. OrdersModule, for diner checkout tokens — see ADR 0002) can reuse
  // this same JwtService/secret instead of registering a second JwtModule.
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
