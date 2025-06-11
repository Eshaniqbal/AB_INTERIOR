import mongoose from 'mongoose';
import type { Invoice, InvoiceItem, PaymentHistory } from '@/types/invoice';
import { MongoClient } from 'mongodb';

const MONGODB_URI = 'mongodb+srv://eshan:eshan123@abinteriors.cdkfbic.mongodb.net/';

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export async function connectDB() {
  if (cached.conn) {
    console.log('Using cached connection');
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    console.log('Creating new connection to MongoDB...');
    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      console.log('Successfully connected to MongoDB');
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    console.error('MongoDB connection error:', e);
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

const PaymentRecordSchema = new mongoose.Schema({
  id: { type: String, required: true },
  amount: { type: Number, required: true },
  date: { type: String, required: true },
  notes: String
});

const InvoiceSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  invoiceNumber: { type: String, required: true },
  invoiceDate: { type: String, required: true },
  dueDate: { type: String, required: true },
  customerName: { type: String, required: true },
  customerAddress: { type: String, required: true },
  customerPhone: { type: String, default: '' },
  customerGst: { type: String, default: '' },
  items: {
    type: [InvoiceItemSchema],
    required: true,
    validate: [(val: any[]) => val.length > 0, 'At least one item is required']
  },
  grandTotal: { type: Number, required: true },
  amountPaid: { type: Number, required: true, default: 0 },
  balanceDue: { type: Number, required: true },
  paymentStatus: { 
    type: String, 
    required: true,
    enum: ['Paid', 'Partial', 'Unpaid', 'Overdue'],
    default: 'Unpaid'
  },
  logoUrl: String,
  previousPendingAmounts: {
    type: [PaymentHistorySchema],
    default: []
  },
  totalPendingAmount: { type: Number, required: true, default: 0 },
  previousOutstanding: { type: Number, required: true, default: 0 },
  note: String,
  paymentHistory: {
    type: [PaymentRecordSchema],
    default: []
  }
}, {
  timestamps: true,
  strict: false
});

// Create models
export const InvoiceModel = mongoose.models.Invoice || mongoose.model('Invoice', InvoiceSchema);

// Company Schema for storing logo
const companySchema = new mongoose.Schema({
  logoUrl: String
});

// Models
export const CompanyModel = mongoose.models.Company || mongoose.model('Company', companySchema);

// Worker Schema
const WorkerSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  phone: { type: String },
  address: { type: String },
  joiningDate: { type: String },
  monthlySalary: { type: Number, required: true, default: 0 },
});

export const WorkerModel = mongoose.models.Worker || mongoose.model('Worker', WorkerSchema);

// WorkerTransaction Schema
const WorkerTransactionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  workerId: { type: String, required: true },
  type: { type: String, required: true, enum: ['salary', 'advance', 'rental', 'other'] },
  amount: { type: Number, required: true },
  date: { type: String, required: true },
  note: { type: String },
});

export const WorkerTransactionModel = mongoose.models.WorkerTransaction || mongoose.model('WorkerTransaction', WorkerTransactionSchema);

// Delete existing Stock model if it exists
delete mongoose.models.Stock;

// Stock Schema
const StockSchema = new mongoose.Schema({
  name: { type: String, required: true },
  quantity: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true // This will automatically handle createdAt and updatedAt
});

// Create new Stock model
export const StockModel = mongoose.model('Stock', StockSchema);

let client;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === 'development') {
  if (!global._mongoClientPromise) {
    client = new MongoClient(MONGODB_URI);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  client = new MongoClient(MONGODB_URI);
  clientPromise = client.connect();
}

export default clientPromise; 