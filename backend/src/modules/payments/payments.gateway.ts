// backend/src/modules/payments/payments.gateway.ts
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PaymentStatus } from './payment.entity';
import { LoyaltyPayoutStatus } from './loyalty-payout.entity';

interface PaymentSocketUser {
  sub: string;
  username: string;
  role: string;
  restaurantId: string;
}

export interface PaymentStatusChangedEvent {
  paymentId: string;
  orderId: string;
  status: PaymentStatus;
  stellarTxHash: string | null;
  failureReason: string | null;
  updatedAt: string;
}

export interface LoyaltyPayoutStatusChangedEvent {
  payoutId: string;
  paymentId: string;
  orderId: string;
  status: LoyaltyPayoutStatus;
  stellarTxHash: string | null;
  failureReason: string | null;
  updatedAt: string;
}

function restaurantRoom(restaurantId: string): string {
  return `restaurant:${restaurantId}`;
}

// Sibling to OrdersGateway (issue #314), following its connection/auth/room
// pattern exactly rather than sharing its namespace — a payment confirming
// asynchronously (independent of any HTTP response in flight) shouldn't
// share a connection lifecycle with order-status events.
@WebSocketGateway({
  namespace: '/payments',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class PaymentsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(PaymentsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  handleConnection(client: Socket): void {
    const token = client.handshake.auth?.token as string | undefined;

    if (!token) {
      this.rejectConnection(client, 'Missing authentication token');
      return;
    }

    try {
      const payload = this.jwtService.verify<PaymentSocketUser>(token, {
        secret: this.configService.get('JWT_SECRET') || 'your-secret-key',
      });

      if (!payload.restaurantId) {
        this.rejectConnection(client, 'Token missing restaurant scope');
        return;
      }

      client.data.user = payload;
      void client.join(restaurantRoom(payload.restaurantId));
      this.logger.log(
        `Client ${client.id} connected (restaurant ${payload.restaurantId})`,
      );
    } catch {
      this.rejectConnection(client, 'Invalid or expired token');
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  private rejectConnection(client: Socket, reason: string): void {
    client.emit('connection:error', { message: reason });
    client.disconnect(true);
  }

  emitPaymentStatusChanged(
    restaurantId: string,
    event: PaymentStatusChangedEvent,
  ): void {
    this.server
      .to(restaurantRoom(restaurantId))
      .emit('payment:status_changed', event);
  }

  emitLoyaltyPayoutStatusChanged(
    restaurantId: string,
    event: LoyaltyPayoutStatusChangedEvent,
  ): void {
    this.server
      .to(restaurantRoom(restaurantId))
      .emit('payout:status_changed', event);
  }
}
