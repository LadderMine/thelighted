import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from '../entities/user.entity';
import { PasswordReset } from '../entities/password-reset.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { EmailService } from './email.service';

@Injectable()
export class PasswordResetService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(PasswordReset)
    private passwordResetRepository: Repository<PasswordReset>,
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
    private emailService: EmailService,
  ) {}

  async requestPasswordReset(email: string) {
    // Find user by email
    const user = await this.userRepository.findOne({ where: { email } });

    // Always return success to prevent email enumeration
    if (!user) {
      return { message: 'If the email exists, a password reset link has been sent' };
    }

    // Generate secure token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = await bcrypt.hash(resetToken, 10);

    // Store reset token with 1-hour expiry
    await this.passwordResetRepository.save({
      userId: user.id,
      token: hashedToken,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    });

    // Send password reset email
    await this.emailService.sendPasswordResetEmail(user.email, resetToken, user.firstName);

    return { message: 'If the email exists, a password reset link has been sent' };
  }

  async resetPassword(token: string, newPassword: string) {
    // Find all non-used tokens
    const resetRecords = await this.passwordResetRepository.find({
      where: { usedAt: null },
      relations: ['user'],
    });

    let matchedRecord = null;
    for (const record of resetRecords) {
      const isValid = await bcrypt.compare(token, record.token);
      if (isValid) {
        matchedRecord = record;
        break;
      }
    }

    if (!matchedRecord) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Check token expiry
    if (new Date() > matchedRecord.expiresAt) {
      throw new BadRequestException('Reset token has expired');
    }

    // Check if token was already used
    if (matchedRecord.usedAt) {
      throw new BadRequestException('Reset token has already been used');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password
    await this.userRepository.update(matchedRecord.userId, { password: hashedPassword });

    // Mark token as used
    await this.passwordResetRepository.update(matchedRecord.id, { usedAt: new Date() });

    // Revoke all refresh tokens (force re-login)
    await this.refreshTokenRepository.update(
      { userId: matchedRecord.userId },
      { isRevoked: true },
    );

    return { message: 'Password reset successfully' };
  }
}
