export type PaymentStatus = 'awaiting-payment' | 'paid';
export type DeliveryStatus = 'ordered' | 'awaiting-arrival' | 'ready' | 'shipped' | 'delivered' | 'cancelled';

export interface CustomerOrder {
  id: string;
  customerName: string;
  email?: string;
  phone?: string;
  items: Array<{ name: string; quantity: number; unitPrice?: number }>;
  total?: number;
  status: string;
  paymentStatus?: PaymentStatus;
  deliveryStatus?: DeliveryStatus;
  createdAt: string;
}
