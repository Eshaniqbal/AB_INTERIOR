import { NextResponse } from 'next/server';
import { connectDB, WorkerModel } from '@/lib/mongodb';
import type { Worker } from '@/types/invoice';

export async function GET() {
  try {
    await connectDB();
    const workers = await WorkerModel.find({}).sort({ name: 1 });
    return NextResponse.json(workers);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch workers' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const worker: Worker = await request.json();
    await connectDB();
    if (!worker.name || !worker.id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    const newWorker = await WorkerModel.create(worker);
    return NextResponse.json(newWorker, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create worker' }, { status: 500 });
  }
} 