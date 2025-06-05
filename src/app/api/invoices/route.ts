import { NextResponse } from 'next/server';
import { connectDB, InvoiceModel, StockModel } from '@/lib/mongodb';
import mongoose from 'mongoose';
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
    await connectDB();
    const data = await request.json();

    // Start a transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Check and update stock quantities
      for (const item of data.items) {
        if (item.stockId) {
          const stock = await StockModel.findById(item.stockId).session(session);
          if (!stock) {
            throw new Error(`Stock item not found: ${item.name}`);
          }
          if (stock.quantity < item.quantity) {
            throw new Error(`Insufficient stock for ${item.name}. Available: ${stock.quantity}`);
          }
          
          // Update stock quantity
          await StockModel.findByIdAndUpdate(
            item.stockId,
            { $inc: { quantity: -item.quantity } },
            { session }
          );
        }
      }

      // Create the invoice
      const invoice = new InvoiceModel(data);
      await invoice.save({ session });

      // Commit the transaction
      await session.commitTransaction();
      return NextResponse.json(invoice);
    } catch (error) {
      // If anything fails, abort the transaction
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error('Error creating invoice:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create invoice' },
      { status: 500 }
    );
  }
} 