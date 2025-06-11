export interface InvoiceItem {
  id: string;
  stockId?: string;
  name: string;
  description?: string;
  quantity: number;
  rate: number;
  total: number;
  availableQuantity?: number;
  stockManaged?: boolean; // Flag to indicate if this item is managed by stock system
}

export interface PaymentHistory {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  date: string;
  status: 'Paid' | 'Partial' | 'Unpaid' | 'Overdue';
}

export interface PaymentRecord {
  id: string;
  amount: number;
  date: string;
  notes?: string;
}

export interface Invoice {
  id: string; // Unique ID for the invoice (e.g., timestamp or UUID)
  invoiceNumber: string;
  invoiceDate: string; // ISO string format recommended
  dueDate: string; // ISO string format recommended
  customerName: string;
  customerAddress: string;
  customerPhone?: string;
  customerGst?: string;
  items: InvoiceItem[];
  grandTotal: number;
  amountPaid: number;
  balanceDue: number;
  paymentStatus: 'Paid' | 'Partial' | 'Unpaid' | 'Overdue';
  logoUrl?: string; // Optional: Store logo as Data URL or path
  previousPendingAmounts?: PaymentHistory[];
  totalPendingAmount?: number;
  previousOutstanding?: number; // Previous outstanding balance
  note?: string; // Optional note about the invoice
  paymentHistory: PaymentRecord[];
}

export interface Worker {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  joiningDate?: string;
  monthlySalary: number;
}

export type WorkerTransactionType = 'salary' | 'advance' | 'rental' | 'other';

export interface WorkerTransaction {
  id: string;
  workerId: string;
  type: WorkerTransactionType;
  amount: number;
  date: string;
  note?: string;
}
