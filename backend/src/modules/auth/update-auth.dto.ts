// backend/src/modules/auth/update-auth.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { RegisterAdminDto } from './auth.dto';

export class UpdateRegisterAdminDto extends PartialType(RegisterAdminDto) {}
