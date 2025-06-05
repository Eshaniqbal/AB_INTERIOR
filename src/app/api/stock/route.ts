import { NextResponse } from 'next/server';
import { connectDB, StockModel } from '@/lib/mongodb';

export async function GET() {
  try {
    await connectDB();
    console.log('Connected to MongoDB');
    
    const stocks = await StockModel.find({}).sort({ createdAt: -1 });
    console.log('Found stocks:', stocks);
    
    return NextResponse.json(stocks);
  } catch (error) {
    console.error('Error fetching stocks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stocks' }, 
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await connectDB();
    console.log('Connected to MongoDB');
    
    const data = await request.json();
    console.log('Received data:', data);

    // Validate required fields
    if (!data.name || data.quantity === undefined) {
      return NextResponse.json(
        { error: 'Name and quantity are required' },
        { status: 400 }
      );
    }

    // Ensure quantity is a positive number
    const quantity = Number(data.quantity);
    if (isNaN(quantity) || quantity < 0) {
      return NextResponse.json(
        { error: 'Quantity must be a positive number' },
        { status: 400 }
      );
    }

    const stockData = {
      name: data.name.trim(),
      quantity: quantity
    };

    // Check if stock with same name exists
    const existingStock = await StockModel.findOne({ name: stockData.name });
    if (existingStock) {
      // Update existing stock quantity
      existingStock.quantity += quantity;
      existingStock.updatedAt = new Date();
      const updatedStock = await existingStock.save();
      console.log('Updated existing stock:', updatedStock);
      return NextResponse.json(updatedStock);
    }

    // Create new stock
    const newStock = new StockModel(stockData);
    console.log('Created new stock:', newStock);

    const savedStock = await newStock.save();
    console.log('Saved stock:', savedStock);

    return NextResponse.json(savedStock);
  } catch (error) {
    console.error('Error adding stock:', error);
    return NextResponse.json(
      { error: 'Failed to add stock' }, 
      { status: 500 }
    );
  }
} 