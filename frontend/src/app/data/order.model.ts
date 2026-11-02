export interface CustomerOrder {
  id: string;
  customerName: string;
  email?: string;
  phone?: string;
  items: Array<{ name: string; quantity: number; unitPrice?: number }>;
  total?: number;
  status: string;
  createdAt: string;
}
