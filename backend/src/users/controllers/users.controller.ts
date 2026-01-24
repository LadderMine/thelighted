import {
  Controller,
  Get,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsersService, PaginationQuery } from '../services/users.service';
import { UpdateProfileDto } from '../../auth/dto/update-profile.dto';
import { ChangePasswordDto } from '../../auth/dto/change-password.dto';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../auth/entities/user.entity';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  async getProfile(@CurrentUser() user) {
    return this.usersService.getProfile(user.id);
  }

  @Put('profile')
  async updateProfile(@CurrentUser() user, @Body() updateProfileDto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, updateProfileDto);
  }

  @Patch('password')
  @HttpCode(HttpStatus.OK)
  async changePassword(@CurrentUser() user, @Body() changePasswordDto: ChangePasswordDto) {
    return this.usersService.changePassword(user.id, changePasswordDto);
  }

  @Delete('account')
  @HttpCode(HttpStatus.OK)
  async deleteAccount(@CurrentUser() user) {
    return this.usersService.deleteAccount(user.id);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  async getUserById(@Param('id') id: string) {
    return this.usersService.getUserById(id);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  async getAllUsers(@Query() query: PaginationQuery) {
    return this.usersService.getAllUsers(query);
  }

  @Patch(':id/role')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async updateUserRole(@Param('id') id: string, @Body('role') role: UserRole) {
    return this.usersService.updateUserRole(id, role);
  }
}
