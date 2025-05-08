import { NextResponse } from 'next/server';
import { connectDB, InvoiceModel } from '@/lib/mongodb';
import type { Invoice } from '@/types/invoice';

export async function GET(request: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const customerPhone = searchParams.get('customerPhone');
    if (customerPhone) {
      // Fetch only the latest invoice for this customer
      const latestInvoice = await InvoiceModel.findOne({ customerPhone }).sort({ invoiceDate: -1 });
      return NextResponse.json(latestInvoice || null);
    }
    // Default: fetch all invoices
    const invoices = await InvoiceModel.find({}).sort({ invoiceDate: -1 });
    return NextResponse.json(invoices);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const invoice: Invoice = await request.json();
    await connectDB();
    
    // Validate required fields
    if (!invoice.invoiceNumber || !invoice.customerName || !invoice.items || invoice.items.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Create new invoice
    const newInvoice = await InvoiceModel.create(invoice);
    return NextResponse.json(newInvoice, { status: 201 });
  } catch (error) {
    console.error('Error creating invoice:', error);
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 });
  }
} 