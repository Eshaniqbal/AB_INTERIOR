import { NextResponse } from 'next/server';
import { connectDB, StockModel } from '@/lib/mongodb';

export async function POST(request: Request) {
  try {
    await connectDB();
    const { stocks } = await request.json();

    if (!Array.isArray(stocks) || stocks.length === 0) {
      return NextResponse.json(
        { error: 'Invalid stock data' },
        { status: 400 }
      );
    }

    let updatedCount = 0;
    let createdCount = 0;

    for (const stock of stocks) {
      if (!stock.name || stock.quantity === undefined) continue;

      const existingStock = await StockModel.findOne({ name: stock.name });
      if (existingStock) {
        existingStock.quantity = stock.quantity;
        await existingStock.save();
        updatedCount++;
      } else {
        await StockModel.create({
          name: stock.name,
          quantity: stock.quantity
        });
        createdCount++;
      }
    }

    return NextResponse.json({
      message: 'Stocks processed successfully',
      count: updatedCount + createdCount,
      updated: updatedCount,
      created: createdCount
    });
  } catch (error) {
    console.error('Error processing stocks:', error);
    return NextResponse.json(
      { error: 'Failed to process stocks' },
      { status: 500 }
    );
  }
} 