"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { InvoiceForm } from '@/components/invoice-form';
import type { Invoice } from '@/types/invoice';
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { Stock } from '@/types/stock';

export default function NewInvoicePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [logo, setLogo] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [availableStocks, setAvailableStocks] = useState<Stock[]>([]);

  useEffect(() => {
    setIsClient(true);
    const loadInitialLogo = async () => {
      try {
        const loadedLogo = await loadLogo();
        setLogo(loadedLogo);
      } catch (error) {
        console.error('Error loading logo:', error);
        toast({
          title: "Error",
          description: "Failed to load logo.",
          variant: "destructive",
        });
      }
    };
    loadInitialLogo();
    fetchAvailableStocks();
  }, [toast]);

  const fetchAvailableStocks = async () => {
    try {
      const response = await fetch('/api/stock/available');
      if (!response.ok) throw new Error('Failed to fetch stocks');
      const stocks = await response.json();
      setAvailableStocks(stocks);
    } catch (error) {
      console.error('Error fetching stocks:', error);
      toast({
        title: "Error",
        description: "Failed to fetch available stocks.",
        variant: "destructive",
      });
    }
  };

  const handleLogoUpload = async (file: File) => {
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const dataUrl = reader.result as string;
        await saveLogo(dataUrl);
        setLogo(dataUrl);
        toast({ title: "Success", description: "Logo uploaded successfully." });
      };
      reader.onerror = () => {
        toast({ title: "Error", description: "Failed to read logo file.", variant: "destructive" });
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast({
        title: "Error",
        description: "Failed to upload logo.",
        variant: "destructive",
      });
    }
  };

  const handleLogoDelete = async () => {
    try {
      await deleteLogo();
      setLogo(null);
      toast({ title: "Success", description: "Logo removed." });
    } catch (error) {
      console.error('Error deleting logo:', error);
      toast({
        title: "Error",
        description: "Failed to delete logo.",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (invoice: Invoice) => {
    try {
      // Add stock IDs to invoice items if they match with available stocks
      const itemsWithStockIds = invoice.items.map(item => {
        const matchingStock = availableStocks.find(stock => stock.name === item.name);
        if (matchingStock) {
          return {
            ...item,
            stockId: matchingStock._id,
            availableQuantity: matchingStock.quantity
          };
        }
        return item;
      });

      const invoiceWithStockIds = {
        ...invoice,
        items: itemsWithStockIds
      };

      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invoiceWithStockIds),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create invoice');
      }

      toast({
        title: "Success",
        description: "Invoice created successfully.",
      });
      router.push('/invoices');
    } catch (error) {
      console.error('Error creating invoice:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create invoice. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (!isClient) {
    return <div>Loading...</div>;
  }

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
        onLogoUpload={handleLogoUpload}
        onLogoDelete={handleLogoDelete}
        availableStocks={availableStocks}
      />
    </div>
  );
}
