"use client";

import { useState, useEffect } from 'react';
import { InvoiceList } from '@/components/invoice-list';
import type { Invoice } from '@/types/invoice';
import { loadInvoices } from '@/lib/storage';
import { Skeleton } from "@/components/ui/skeleton";

export default function InvoicesListPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const fetchInvoices = async () => {
      try {
        const loaded = await loadInvoices();
        setInvoices(loaded);
      } catch (error) {
        console.error('Error loading invoices:', error);
        setInvoices([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchInvoices();
  }, []);

  const handleDeleteInvoice = async (id: string) => {
    try {
      const updatedInvoices = await loadInvoices();
      setInvoices(updatedInvoices);
    } catch (error) {
      console.error('Error reloading invoices after deletion:', error);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-primary">Saved Invoices</h1>

      {isClient ? (
        isLoading ? (
          // Skeleton Loader while loading
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Skeleton className="h-10 w-1/3" />
              <Skeleton className="h-10 w-32" />
            </div>
            <Skeleton className="h-64 w-full rounded-lg" />
            <div className="flex justify-between items-center">
              <Skeleton className="h-6 w-24" />
              <div className="flex space-x-2">
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-9 w-24" />
              </div>
            </div>
          </div>
        ) : (
          <InvoiceList invoices={invoices} onDelete={handleDeleteInvoice} />
        )
      ) : (
        // Initial server render
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <Skeleton className="h-10 w-1/3" />
            <Skeleton className="h-10 w-32" />
          </div>
          <Skeleton className="h-64 w-full rounded-lg" />
          <div className="flex justify-between items-center">
            <Skeleton className="h-6 w-24" />
            <div className="flex space-x-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-24" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
