import { IsString, MinLength, Matches, IsUUID } from 'class-validator';

export class ResetPasswordDto {
  @IsUUID('4', { message: 'Invalid reset token format' })
  token: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'Password must contain uppercase, lowercase, number, and special character',
  })
  newPassword: string;
}
