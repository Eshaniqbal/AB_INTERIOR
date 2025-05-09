export interface InvoiceItem {
  id?: string;
  name: string;
  description?: string;
  quantity: number;
  rate: number;
  total: number;
}

export interface PaymentHistory {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  date: string;
  status: 'Paid' | 'Partial' | 'Unpaid' | 'Overdue';
}

export interface Invoice {
  id: string; // Unique ID for the invoice (e.g., timestamp or UUID)
  invoiceNumber: string;
  invoiceDate: string; // ISO string format recommended
  dueDate: string; // ISO string format recommended
  customerName: string;
  customerAddress: string;
  customerPhone: string;
  customerGst: string;
  items: InvoiceItem[];
  grandTotal: number;
  amountPaid: number;
  balanceDue: number;
  paymentStatus: 'Paid' | 'Partial' | 'Unpaid' | 'Overdue';
  logoUrl?: string | null; // Optional: Store logo as Data URL or path
  previousPendingAmounts: PaymentHistory[];
  totalPendingAmount: number;
  previousOutstanding: number; // Previous outstanding balance
  note?: string; // Optional note about the invoice
}
