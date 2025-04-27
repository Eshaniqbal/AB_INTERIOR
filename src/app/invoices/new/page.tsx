
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { InvoiceForm } from '@/components/invoice-form';
import type { Invoice } from '@/types/invoice';
import { addInvoice, saveLogo, loadLogo, deleteLogo } from '@/lib/storage';
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function NewInvoicePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [logo, setLogo] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true); // Ensure localStorage is accessed only on the client
    const loadedLogo = loadLogo();
    setLogo(loadedLogo);
  }, []);

  const handleLogoUpload = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      saveLogo(dataUrl);
      setLogo(dataUrl);
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
        toast({ title: "Success", description: "Logo removed." });
    };


  const handleSaveInvoice = (data: Invoice) => {
     try {
        // Ensure the logo from the state is included if it exists
        const invoiceData = { ...data, logoUrl: logo };
        addInvoice(invoiceData);
        toast({
            title: "Success",
            description: "Invoice created successfully.",
        });
        router.push('/invoices'); // Redirect to the invoice list page
     } catch (error) {
         console.error("Failed to save invoice:", error);
         toast({
            title: "Error",
            description: "Failed to save invoice. Please try again.",
            variant: "destructive",
        });
     }
  };

  if (!isClient) {
    // Optional: Render a loading state or null while waiting for client-side mount
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
        <div className="flex items-center justify-between">
            <Link href="/invoices" className="flex items-center text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back to Invoices
            </Link>
            <h1 className="text-2xl font-semibold">Create New Invoice</h1>
            <div/> {/* Placeholder for alignment */}
        </div>

      <InvoiceForm
        onSubmit={handleSaveInvoice}
        onCancel={() => router.push('/invoices')}
        logo={logo}
        onLogoUpload={handleLogoUpload}
        onLogoDelete={handleLogoDelete}
      />
    </div>
  );
}
