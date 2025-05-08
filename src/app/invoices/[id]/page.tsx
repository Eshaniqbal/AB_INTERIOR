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
import { Input } from '@/components/ui/input';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export default function ViewInvoicePage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [isPaying, setIsPaying] = useState(false);

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

  const handleRecordPayment = async () => {
    if (!invoice) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: 'Error', description: 'Enter a valid payment amount.', variant: 'destructive' });
      return;
    }
    setIsPaying(true);
    try {
      const newAmountPaid = (Number(invoice.amountPaid) || 0) + amount;
      const newBalanceDue = (Number(invoice.grandTotal) + Number(invoice.previousOutstanding || 0)) - newAmountPaid;
      let newPaymentStatus: Invoice['paymentStatus'] = 'Unpaid';
      if (newAmountPaid >= (Number(invoice.grandTotal) + Number(invoice.previousOutstanding || 0))) {
        newPaymentStatus = 'Paid';
      } else if (newAmountPaid > 0) {
        newPaymentStatus = 'Partial';
      }
      const updatedInvoice = {
        ...invoice,
        amountPaid: newAmountPaid,
        balanceDue: newBalanceDue,
        paymentStatus: newPaymentStatus,
      };
      await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedInvoice),
      });
      setInvoice(updatedInvoice);
      setShowPaymentDialog(false);
      setPaymentAmount('');
      toast({ title: 'Success', description: 'Payment recorded successfully.' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to record payment.', variant: 'destructive' });
    } finally {
      setIsPaying(false);
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
          <Button variant="default" size="sm" onClick={() => setShowPaymentDialog(true)}>
            Record Payment
          </Button>
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

      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block mb-1 font-medium">Outstanding Amount</label>
              <div className="mb-2">₹{(Number(invoice.grandTotal) + Number(invoice.previousOutstanding || 0) - Number(invoice.amountPaid || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
            </div>
            <div>
              <label className="block mb-1 font-medium" htmlFor="paymentAmount">Payment Amount</label>
              <Input
                id="paymentAmount"
                type="number"
                min="0.01"
                step="0.01"
                value={paymentAmount}
                onChange={e => setPaymentAmount(e.target.value)}
                disabled={isPaying}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)} disabled={isPaying}>Cancel</Button>
            <Button onClick={handleRecordPayment} disabled={isPaying || !paymentAmount}>
              {isPaying ? 'Recording...' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
