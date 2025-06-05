import { NextResponse } from 'next/server';
import { connectDB, StockModel } from '@/lib/mongodb';

export async function GET() {
  try {
    await connectDB();
    const stocks = await StockModel.find({ quantity: { $gt: 0 } }).sort({ name: 1 });
    return NextResponse.json(stocks);
  } catch (error) {
    console.error('Error fetching available stocks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch available stocks' },
      { status: 500 }
    );
  }
} 