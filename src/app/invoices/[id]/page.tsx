"use client";

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { InvoicePreview } from '@/components/invoice-preview';
import type { Invoice } from '@/types/invoice';
import { getInvoiceById, deleteInvoice, loadLogo } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Edit, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function ViewInvoicePage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);

  const invoiceId = Array.isArray(params.id) ? params.id[0] : params.id;

  useEffect(() => {
    setIsClient(true);
    const loadData = async () => {
      if (invoiceId) {
        try {
          const loadedLogo = loadLogo();
          setLogo(loadedLogo);
          
          const loadedInvoice = await getInvoiceById(invoiceId);
          if (loadedInvoice) {
            setInvoice({
              ...loadedInvoice,
              logoUrl: loadedInvoice.logoUrl !== undefined ? loadedInvoice.logoUrl : loadedLogo
            });
          } else {
            toast({ title: "Error", description: "Invoice not found.", variant: "destructive" });
            router.push('/invoices');
          }
        } catch (error) {
          console.error('Error loading invoice:', error);
          toast({ title: "Error", description: "Failed to load invoice.", variant: "destructive" });
          router.push('/invoices');
        }
      } else {
        toast({ title: "Error", description: "Invalid invoice ID.", variant: "destructive" });
        router.push('/invoices');
      }
      setIsLoading(false);
    };

    loadData();
  }, [invoiceId, router, toast]);

  const handleDelete = async () => {
    if (invoiceId) {
      try {
        await deleteInvoice(invoiceId);
        toast({ title: "Success", description: "Invoice deleted successfully." });
        router.push('/invoices');
      } catch (error) {
        console.error('Error deleting invoice:', error);
        toast({ title: "Error", description: "Failed to delete invoice.", variant: "destructive" });
      }
    }
  };

  if (!isClient || isLoading) {
    return <div className="flex justify-center items-center min-h-screen"><p>Loading invoice...</p></div>;
  }

  if (!invoice) {
    return <div className="flex justify-center items-center min-h-screen"><p>Invoice not found.</p></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print-hide">
        <Link href="/invoices" className="flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Invoices
        </Link>
        <div className="flex space-x-2">
          <Link href={`/invoices/${invoiceId}/edit`} passHref>
            <Button variant="outline" size="sm">
              <Edit className="mr-2 h-4 w-4" /> Edit
            </Button>
          </Link>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the invoice
                  <span className="font-semibold"> #{invoice.invoiceNumber}</span>.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <InvoicePreview invoice={invoice} logoUrl={invoice.logoUrl || logo} />
    </div>
  );
}
