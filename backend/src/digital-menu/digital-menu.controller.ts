import { Controller, Get, Post, Param, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DigitalMenuService } from './digital-menu.service';

@Controller('api/menu')
export class DigitalMenuController {
  constructor(private readonly service: DigitalMenuService) {}

  @Get('public/:qrCode')
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  getMenu(@Param('qrCode') code: string) {
    return this.service.getMenuByQRCode(code);
  }

  @Post('public/:qrCode/scan')
  registerScan(@Param('qrCode') code: string, @Req() req: any) {
    return this.service.registerScan(code, req);
  }
}
