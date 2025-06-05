"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { InvoiceForm } from '@/components/invoice-form';
import type { Invoice } from '@/types/invoice';
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { Stock } from '@/types/stock';
import { addInvoice } from '@/lib/storage';
import { useLogoStore } from '@/lib/store';

export default function NewInvoicePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [availableStocks, setAvailableStocks] = useState<Stock[]>([]);
  const { logo } = useLogoStore();

  useEffect(() => {
    // Fetch available stocks
    const fetchStocks = async () => {
      try {
        const response = await fetch('/api/stock');
        if (!response.ok) {
          throw new Error('Failed to fetch stocks');
        }
        const data = await response.json();
        setAvailableStocks(data);
      } catch (error) {
        console.error('Error fetching stocks:', error);
      }
    };

    fetchStocks();
  }, []);

  const handleSubmit = async (data: any) => {
    await addInvoice(data);
    router.push('/invoices');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/invoices" className="flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Invoices
        </Link>
        <h1 className="text-3xl font-bold">Create New Invoice</h1>
      </div>
      <InvoiceForm
        onSubmit={handleSubmit}
        onCancel={() => router.push('/invoices')}
        logo={logo}
        onLogoUpload={() => {}}
        onLogoDelete={() => {}}
        availableStocks={availableStocks}
      />
    </div>
  );
}
