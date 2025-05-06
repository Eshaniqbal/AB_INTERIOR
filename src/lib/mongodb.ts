import mongoose from 'mongoose';
import type { Invoice, InvoiceItem, PaymentHistory } from '@/types/invoice';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://abinteriors:abinteriors@cluster0.8q0qg.mongodb.net/abinteriors?retryWrites=true&w=majority';

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

// Define schemas
const InvoiceItemSchema = new mongoose.Schema({
  id: String,
  name: { type: String, required: true },
  description: String,
  quantity: { type: Number, required: true },
  rate: { type: Number, required: true },
  total: { type: Number, required: true }
});

const PaymentHistorySchema = new mongoose.Schema({
  invoiceId: { type: String, required: true },
  invoiceNumber: { type: String, required: true },
  amount: { type: Number, required: true },
  date: { type: String, required: true },
  status: { 
    type: String, 
    required: true,
    enum: ['Paid', 'Partial', 'Unpaid', 'Overdue']
  }
});

const InvoiceSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  invoiceNumber: { type: String, required: true },
  invoiceDate: { type: String, required: true },
  dueDate: { type: String, required: true },
  customerName: { type: String, required: true },
  customerAddress: { type: String, required: true },
  customerPhone: String,
  customerGst: String,
  items: [InvoiceItemSchema],
  grandTotal: { type: Number, required: true },
  amountPaid: { type: Number, required: true, default: 0 },
  balanceDue: { type: Number, required: true },
  paymentStatus: { 
    type: String, 
    required: true,
    enum: ['Paid', 'Partial', 'Unpaid', 'Overdue']
  },
  logoUrl: String,
  previousPendingAmounts: [PaymentHistorySchema],
  totalPendingAmount: { type: Number, required: true, default: 0 },
  previousOutstanding: { type: Number, required: true, default: 0 },
  note: String
});

// Create models
export const InvoiceModel = mongoose.models.Invoice || mongoose.model('Invoice', InvoiceSchema);

// Company Schema for storing logo
const companySchema = new mongoose.Schema({
  logoUrl: String
});

// Models
export const CompanyModel = mongoose.models.Company || mongoose.model('Company', companySchema); 