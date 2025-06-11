import { NextResponse } from 'next/server';
import { connectDB, StockModel } from '@/lib/mongodb';

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB();
    
    if (!params.id) {
      return NextResponse.json(
        { error: 'Stock ID is required' },
        { status: 400 }
      );
    }

    const result = await StockModel.findByIdAndDelete(params.id);
    
    if (!result) {
      return NextResponse.json(
        { error: 'Stock not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { message: 'Stock deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting stock:', error);
    return NextResponse.json(
      { error: 'Failed to delete stock' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB();
    const data = await request.json();

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

    const stock = await StockModel.findById(params.id);
    if (!stock) {
      return NextResponse.json(
        { error: 'Stock not found' },
        { status: 404 }
      );
    }

    stock.name = data.name.trim();
    stock.quantity = quantity;
    stock.updatedAt = new Date();

    const updatedStock = await stock.save();
    return NextResponse.json(updatedStock);
  } catch (error) {
    console.error('Error updating stock:', error);
    return NextResponse.json(
      { error: 'Failed to update stock' },
      { status: 500 }
    );
  }
} 