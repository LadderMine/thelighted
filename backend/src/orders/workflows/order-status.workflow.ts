import { OrderStatus } from "src/common/enums/orderStatus.enun";

export const VALID_STATUS_TRANSITIONS: Record<
  OrderStatus,
  OrderStatus[]
> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  PREPARING: [OrderStatus.READY],
  READY: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.COMPLETED],
  OUT_FOR_DELIVERY: [OrderStatus.COMPLETED],
  COMPLETED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return VALID_STATUS_TRANSITIONS[from]?.includes(to);
}
