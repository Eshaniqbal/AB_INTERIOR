
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

  const invoiceId = Array.isArray(params.id) ? params.id[0] : params.id;

   useEffect(() => {
    setIsClient(true); // Ensure localStorage is accessed only on the client
    if (invoiceId) {
      const loadedInvoice = getInvoiceById(invoiceId);
       const loadedLogo = loadLogo(); // Load logo regardless of invoice
       setLogo(loadedLogo);

      if (loadedInvoice) {
        setInvoice(loadedInvoice);
      } else {
        toast({ title: "Error", description: "Invoice not found.", variant: "destructive" });
        router.push('/invoices');
      }
    } else {
         toast({ title: "Error", description: "Invalid invoice ID.", variant: "destructive" });
         router.push('/invoices');
    }
    setIsLoading(false);
  }, [invoiceId, router, toast]);

  const handleLogoUpload = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      saveLogo(dataUrl);
      setLogo(dataUrl); // Update local state
       // Update the invoice state as well if needed, though the form might handle it
       if (invoice) {
           setInvoice({...invoice, logoUrl: dataUrl });
       }
      toast({ title: "Success", description: "Logo uploaded successfully." });
    };
     reader.onerror = () => {
       toast({ title: "Error", description: "Failed to read logo file.", variant: "destructive" });
    }
    reader.readAsDataURL(file);
  };

   const handleLogoDelete = () => {
        deleteLogo();
        setLogo(null);
         if (invoice) {
           setInvoice({...invoice, logoUrl: null });
       }
        toast({ title: "Success", description: "Logo removed." });
    };

  const handleUpdateInvoice = (data: Invoice) => {
     try {
         // Ensure the updated logo from state is included
        const invoiceData = { ...data, id: invoiceId, logoUrl: logo };
        updateInvoice(invoiceData);
        toast({
            title: "Success",
            description: "Invoice updated successfully.",
        });
        router.push(`/invoices/${invoiceId}`); // Redirect to the invoice view page
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
    // Render a loading state
    return (
        <div className="flex justify-center items-center min-h-screen">
             <p>Loading invoice details...</p>
        </div>
        );
  }

  if (!invoice) {
     // This case should ideally be handled by the redirect in useEffect, but good for safety
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
            <div/> {/* Placeholder for alignment */}
        </div>

      <InvoiceForm
        initialData={invoice}
        onSubmit={handleUpdateInvoice}
        onCancel={() => router.push(`/invoices/${invoiceId}`)}
        logo={logo} // Pass the potentially updated logo state
        onLogoUpload={handleLogoUpload}
        onLogoDelete={handleLogoDelete}
      />
    </div>
  );
}
