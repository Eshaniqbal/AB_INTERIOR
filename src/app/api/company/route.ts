import { NextResponse } from 'next/server';
import { connectDB, CompanyModel } from '@/lib/mongodb';

export async function GET() {
  try {
    await connectDB();
    const company = await CompanyModel.findOne({});
    return NextResponse.json(company);
  } catch (error) {
    console.error('Error fetching company:', error);
    return NextResponse.json({ error: 'Failed to fetch company' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { logoUrl } = await request.json();
    await connectDB();
    const company = await CompanyModel.findOneAndUpdate(
      {},
      { logoUrl },
      { upsert: true, new: true }
    );
    return NextResponse.json(company);
  } catch (error) {
    console.error('Error updating company:', error);
    return NextResponse.json({ error: 'Failed to update company' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await connectDB();
    await CompanyModel.deleteOne({});
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting company:', error);
    return NextResponse.json({ error: 'Failed to delete company' }, { status: 500 });
  }
} 