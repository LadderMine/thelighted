// backend/src/modules/payments/payouts.controller.ts
import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Request,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Throttle } from '@nestjs/throttler';
import { Order } from '../orders/order.entity';
import { LoyaltyPayout, LoyaltyPayoutStatus } from './loyalty-payout.entity';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminRole } from '../auth/admin-user.entity';

interface StaffRequest {
  user: { restaurantId: string };
}

// Staff-facing — protected by the app's global JwtAuthGuard + RolesGuard
// (see app.module.ts), the mirror image of PaymentsController's diner-
// facing @Public() endpoints. Issue #316: "define who can trigger a
// payout on a restaurant's behalf" (ADR 0004).
@Controller('payments/:paymentId/payout')
export class PayoutsController {
  constructor(
    @InjectRepository(LoyaltyPayout)
    private readonly payoutRepository: Repository<LoyaltyPayout>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  // Read-only status check — no @Roles() restriction, same as
  // AdminController.getDashboard: any authenticated staff member at the
  // restaurant can see it, only the retry action below is a financial
  // action gated by role.
  @Get()
  async findOne(
    @Param('paymentId') paymentId: string,
    @Request() req: StaffRequest,
  ): Promise<LoyaltyPayout> {
    return this.findScoped(paymentId, req.user.restaurantId);
  }

  /**
   * Manual retry. LoyaltyPayoutService's scheduled job already retries a
   * FAILED payout automatically once its backoff window elapses — this
   * exists for an ops-visible "retry now" action, restricted to managers
   * and above (a financial trigger, unlike the read-only status check).
   * No-op (not an error) if the payout isn't currently FAILED, matching
   * PaymentsService.submitSigned's idempotent-replay shape.
   */
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('retry')
  @Roles(AdminRole.MANAGER, AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  async retry(
    @Param('paymentId') paymentId: string,
    @Request() req: StaffRequest,
  ): Promise<LoyaltyPayout> {
    const payout = await this.findScoped(paymentId, req.user.restaurantId);
    if (payout.status !== LoyaltyPayoutStatus.FAILED) {
      return payout;
    }

    // Clears the backoff wait so the next scheduled tick (at most a few
    // seconds away) picks it up immediately, instead of a staff member
    // waiting out whatever backoff window it was already in.
    payout.lastAttemptAt = null;
    return this.payoutRepository.save(payout);
  }

  private async findScoped(
    paymentId: string,
    restaurantId: string,
  ): Promise<LoyaltyPayout> {
    const payout = await this.payoutRepository.findOne({
      where: { paymentId },
    });
    if (!payout) {
      throw new NotFoundException('Loyalty payout not found for this payment');
    }

    // Either the order doesn't exist or belongs to a different restaurant
    // — 404 either way, so this never leaks cross-restaurant existence.
    const order = await this.orderRepository.findOne({
      where: { id: payout.orderId, restaurantId },
    });
    if (!order) {
      throw new NotFoundException('Loyalty payout not found for this payment');
    }

    return payout;
  }
}
