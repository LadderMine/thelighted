import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QRCode } from '../qr-codes/entities/qr-code.entity';
import { UAParser } from 'ua-parser-js';

@Injectable()
export class DigitalMenuService {
  constructor(
    @InjectRepository(QRCode)
    private readonly qrRepo: Repository<QRCode>,
  ) {}

  async getMenuByQRCode(code: string) {
    const qr = await this.qrRepo.findOne({
      where: { code, isActive: true },
    });

    if (!qr) throw new NotFoundException();

    return {
      restaurant: { id: qr.restaurantId },
      table: qr.location,
      menu: [],
    };
  }

  async registerScan(code: string, req: any) {
    const qr = await this.qrRepo.findOne({
      where: { code, isActive: true },
    });

    if (!qr) throw new NotFoundException();

    const ua = new UAParser(req.headers['user-agent']);

    qr.scanCount += 1;
    qr.lastScannedAt = new Date();
    await this.qrRepo.save(qr);

    return { success: true, device: ua.getDevice() };
  }
}
