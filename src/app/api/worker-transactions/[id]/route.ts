import { NextResponse } from 'next/server';
import { connectDB, WorkerTransactionModel } from '@/lib/mongodb';
import type { WorkerTransaction } from '@/types/invoice';

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const updatedData: Partial<WorkerTransaction> = await request.json();
    const updatedTransaction = await WorkerTransactionModel.findOneAndUpdate(
      { id: params.id },
      updatedData,
      { new: true }
    );
    if (!updatedTransaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }
    return NextResponse.json(updatedTransaction);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const result = await WorkerTransactionModel.deleteOne({ id: params.id });
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 });
    }
    return NextResponse.json({ message: 'Transaction deleted successfully' }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 });
  }
} 