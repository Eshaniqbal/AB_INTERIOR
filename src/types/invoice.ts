
export interface InvoiceItem {
  id: string; // Unique ID for each item row
  name: string;
  quantity: number;
  rate: number;
  description: string;
  total: number;
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
}
