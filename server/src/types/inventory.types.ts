import type { MarketManOrder } from "../services/marketman.service.js";

export interface OrderTrackerOrderDto {
  poNumber: string;
  supplier: string;
  deliveryDate: string;
  sentDate: string;
  status: string;
  orderDetails: MarketManOrder;
}
