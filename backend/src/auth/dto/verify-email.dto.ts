import { IsUUID } from 'class-validator';

export class VerifyEmailDto {
  @IsUUID('4', { message: 'Invalid verification token format' })
  token: string;
}
