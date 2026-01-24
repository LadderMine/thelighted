import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

export interface EmailJob {
  to: string;
  subject: string;
  html: string;
  text: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(
    private configService: ConfigService,
    @InjectQueue('email') private emailQueue: Queue,
  ) {
    // Configure nodemailer
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST') || 'smtp.gmail.com',
      port: this.configService.get<number>('SMTP_PORT') || 587,
      secure: false,
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendVerificationEmail(email: string, token: string, firstName: string) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    const verificationLink = `${frontendUrl}/auth/verify-email?token=${token}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to TheLighted, ${firstName}!</h2>
        <p>Thank you for registering. Please verify your email address by clicking the button below:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationLink}" style="background-color: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Verify Email
          </a>
        </div>
        <p>Or copy and paste this link into your browser:</p>
        <p style="color: #666; word-break: break-all;">${verificationLink}</p>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't create an account, please ignore this email.</p>
      </div>
    `;

    const text = `Welcome to TheLighted, ${firstName}! Please verify your email by visiting: ${verificationLink}. This link will expire in 24 hours.`;

    await this.queueEmail({
      to: email,
      subject: 'Verify Your Email - TheLighted',
      html,
      text,
    });
  }

  async sendPasswordResetEmail(email: string, token: string, firstName: string) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    const resetLink = `${frontendUrl}/auth/reset-password?token=${token}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>Hi ${firstName},</p>
        <p>We received a request to reset your password. Click the button below to reset it:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #2196F3; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p>Or copy and paste this link into your browser:</p>
        <p style="color: #666; word-break: break-all;">${resetLink}</p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
      </div>
    `;

    const text = `Hi ${firstName}, we received a request to reset your password. Visit this link to reset it: ${resetLink}. This link will expire in 1 hour.`;

    await this.queueEmail({
      to: email,
      subject: 'Password Reset - TheLighted',
      html,
      text,
    });
  }

  async sendWelcomeEmail(email: string, firstName: string) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to TheLighted!</h2>
        <p>Hi ${firstName},</p>
        <p>Your email has been verified successfully. You can now access all features of TheLighted.</p>
        <p>Start exploring our platform and enjoy your experience!</p>
        <p>If you have any questions, feel free to contact our support team.</p>
        <p>Best regards,<br>The TheLighted Team</p>
      </div>
    `;

    const text = `Welcome to TheLighted, ${firstName}! Your email has been verified successfully.`;

    await this.queueEmail({
      to: email,
      subject: 'Welcome to TheLighted',
      html,
      text,
    });
  }

  private async queueEmail(emailJob: EmailJob) {
    try {
      await this.emailQueue.add('send-email', emailJob, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      });
      this.logger.log(`Email queued successfully to ${emailJob.to}`);
    } catch (error) {
      this.logger.error(`Failed to queue email: ${error.message}`);
      throw error;
    }
  }

  async sendEmail(emailJob: EmailJob) {
    try {
      const info = await this.transporter.sendMail({
        from: `"TheLighted" <${this.configService.get<string>('SMTP_USER')}>`,
        to: emailJob.to,
        subject: emailJob.subject,
        text: emailJob.text,
        html: emailJob.html,
      });

      this.logger.log(`Email sent successfully: ${info.messageId}`);
      return info;
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`);
      throw error;
    }
  }
}
