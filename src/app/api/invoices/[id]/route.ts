import { NextResponse } from 'next/server';
import { connectDB, InvoiceModel } from '@/lib/mongodb';
import type { Invoice } from '@/types/invoice';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB();
    
    // Get the ID from the URL
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/');
    const invoiceId = pathSegments[pathSegments.length - 1];

    if (!invoiceId) {
      return NextResponse.json(
        { error: 'Invoice ID is required' },
        { status: 400 }
      );
    }

    const invoice = await InvoiceModel.findOne({ id: invoiceId });
    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(invoice);
  } catch (error) {
    console.error('Error fetching invoice:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invoice' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB();
    
    // Get the ID from the URL
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/');
    const invoiceId = pathSegments[pathSegments.length - 1];

    if (!invoiceId) {
      return NextResponse.json(
        { error: 'Invoice ID is required' },
        { status: 400 }
      );
    }

    const existingInvoice = await InvoiceModel.findOne({ id: invoiceId });
    if (!existingInvoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    const result = await InvoiceModel.deleteOne({ id: invoiceId });
    
    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: 'Failed to delete invoice' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Invoice deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting invoice:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/');
    const invoiceId = pathSegments[pathSegments.length - 1];
    if (!invoiceId) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
    }
    const updatedData: Partial<Invoice> = await request.json();
    const updatedInvoice = await InvoiceModel.findOneAndUpdate(
      { id: invoiceId },
      updatedData,
      { new: true }
    );
    if (!updatedInvoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    return NextResponse.json(updatedInvoice);
  } catch (error) {
    console.error('Error updating invoice:', error);
    return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 });
  }
} 