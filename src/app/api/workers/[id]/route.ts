import { NextResponse } from 'next/server';
import { connectDB, WorkerModel } from '@/lib/mongodb';
import type { Worker } from '@/types/invoice';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const worker = await WorkerModel.findOne({ id: params.id });
    if (!worker) {
      return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
    }
    return NextResponse.json(worker);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch worker' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const updatedData: Partial<Worker> = await request.json();
    const updatedWorker = await WorkerModel.findOneAndUpdate(
      { id: params.id },
      updatedData,
      { new: true }
    );
    if (!updatedWorker) {
      return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
    }
    return NextResponse.json(updatedWorker);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update worker' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const result = await WorkerModel.deleteOne({ id: params.id });
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Failed to delete worker' }, { status: 500 });
    }
    return NextResponse.json({ message: 'Worker deleted successfully' }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete worker' }, { status: 500 });
  }
} 