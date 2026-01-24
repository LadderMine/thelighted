import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({ namespace: '/orders' })
export class OrdersGateway {
  @WebSocketServer()
  server: Server;

  emitToRestaurant(restaurantId: string, event: string, payload: any) {
    this.server
      .to(`restaurant:${restaurantId}`)
      .emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: any) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }
}
