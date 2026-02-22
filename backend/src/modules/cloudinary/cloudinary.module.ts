// backend/src/modules/cloudinary/cloudinary.module.ts
import { Module } from '@nestjs/common';
import { CloudinaryProvider } from './cloudinary.config';
import { CloudinaryService } from './cloudinary.service';
import { CloudinaryController } from './cloudinary.controller';

@Module({
  providers: [CloudinaryProvider, CloudinaryService],
  controllers: [CloudinaryController],
  exports: [CloudinaryService],
})
export class CloudinaryModule {}
