"use client";

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { InvoiceForm } from '@/components/invoice-form';
import type { Invoice } from '@/types/invoice';
import { getInvoiceById, updateInvoice, saveLogo, loadLogo, deleteLogo } from '@/lib/storage';
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function EditInvoicePage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Always ensure invoiceId is a string
  const invoiceIdRaw = Array.isArray(params.id) ? params.id[0] : params.id;
  const invoiceId = invoiceIdRaw || '';

  useEffect(() => {
    setIsClient(true);
    if (invoiceId) {
      (async () => {
        setIsLoading(true);
        setError(null);
        try {
          const loadedInvoice = await getInvoiceById(invoiceId);
          const loadedLogo = await loadLogo();
          setLogo(loadedLogo);
          if (loadedInvoice) {
            setInvoice(loadedInvoice);
          } else {
            setError("Invoice not found.");
            toast({ title: "Error", description: "Invoice not found.", variant: "destructive" });
            router.push('/invoices');
          }
        } catch (err) {
          setError("Failed to load invoice.");
          toast({ title: "Error", description: "Failed to load invoice.", variant: "destructive" });
        } finally {
          setIsLoading(false);
        }
      })();
    } else {
      setError("Invalid invoice ID.");
      toast({ title: "Error", description: "Invalid invoice ID.", variant: "destructive" });
      router.push('/invoices');
      setIsLoading(false);
    }
  }, [invoiceId, router, toast]);

  const handleLogoUpload = async (file: File) => {
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const dataUrl = reader.result as string;
        await saveLogo(dataUrl);
        setLogo(dataUrl);
        if (invoice) {
          setInvoice({ ...invoice, logoUrl: dataUrl });
        }
        toast({ title: "Success", description: "Logo uploaded successfully." });
      };
      reader.onerror = () => {
        toast({ title: "Error", description: "Failed to read logo file.", variant: "destructive" });
      };
      reader.readAsDataURL(file);
    } catch (err) {
      toast({ title: "Error", description: "Failed to upload logo.", variant: "destructive" });
    }
  };

  const handleLogoDelete = async () => {
    try {
      await deleteLogo();
      setLogo(null);
      if (invoice) {
        setInvoice({ ...invoice, logoUrl: null });
      }
      toast({ title: "Success", description: "Logo removed." });
    } catch (err) {
      toast({ title: "Error", description: "Failed to delete logo.", variant: "destructive" });
    }
  };

  const handleUpdateInvoice = async (data: Invoice) => {
    try {
      const invoiceData = {
        ...data,
        id: invoiceId,
        logoUrl: logo
      };
      await updateInvoice(invoiceData);
      toast({
        title: "Success",
        description: "Invoice updated successfully.",
      });
      router.push(`/invoices/${invoiceId}`);
    } catch (error) {
      console.error("Failed to update invoice:", error);
      toast({
        title: "Error",
        description: "Failed to update invoice. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (!isClient || isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p>Loading invoice details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!invoice) {
    return <div className="flex justify-center items-center min-h-screen"><p>Invoice not found.</p></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href={`/invoices/${invoiceId}`} className="flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Invoice
        </Link>
        <h1 className="text-2xl font-semibold">Edit Invoice #{invoice.invoiceNumber}</h1>
        <div /> {/* Placeholder for alignment */}
      </div>
      <InvoiceForm
        initialData={invoice}
        onSubmit={handleUpdateInvoice}
        onCancel={() => router.push(`/invoices/${invoiceId}`)}
        logo={logo}
        onLogoUpload={handleLogoUpload}
        onLogoDelete={handleLogoDelete}
      />
    </div>
  );
}
