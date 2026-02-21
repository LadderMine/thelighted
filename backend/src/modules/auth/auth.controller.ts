// backend/src/modules/auth/auth.controller.ts
import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Patch,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RegisterAdminDto, ChangePasswordDto } from './auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UpdateRegisterAdminDto } from './update-auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    return await this.authService.login(loginDto);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerAdminDto: RegisterAdminDto) {
    return await this.authService.register(registerAdminDto);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Request() req,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    const restaurantId = req.user.restaurantId;
    return await this.authService.changePassword(
      req.user.id,
      changePasswordDto,
      restaurantId,
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req) {
    return req.user;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout() {
    // In the app, you might want to blacklist the token
    return { message: 'Logged out successfully' };
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  async updateUser(@Request() req, @Body() data: UpdateRegisterAdminDto) {
    const restaurantId = req.user.restaurantId;
    return await this.authService.updateUserProfile(
      req.user.id,
      data,
      restaurantId,
    );
  }
}
