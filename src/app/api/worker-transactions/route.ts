import { NextResponse } from 'next/server';
import { connectDB, WorkerTransactionModel } from '@/lib/mongodb';
import type { WorkerTransaction } from '@/types/invoice';

export async function GET(request: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const workerId = searchParams.get('workerId');
    const filter = workerId ? { workerId } : {};
    const transactions = await WorkerTransactionModel.find(filter).sort({ date: -1 });
    return NextResponse.json(transactions);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const transaction: WorkerTransaction = await request.json();
    await connectDB();
    if (!transaction.workerId || !transaction.id || !transaction.type || !transaction.amount || !transaction.date) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    const newTransaction = await WorkerTransactionModel.create(transaction);
    return NextResponse.json(newTransaction, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 });
  }
} 