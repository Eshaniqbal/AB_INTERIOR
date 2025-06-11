"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { InvoicePreview } from '@/components/invoice-preview';
import type { Invoice } from '@/types/invoice';
import { getInvoiceById, deleteInvoice, loadLogo } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Edit, Trash2, Download, Share2, Printer } from 'lucide-react';
import Link from 'next/link';
import { useToast } from "@/hooks/use-toast";
import { formatDate, formatCurrency } from '@/lib/utils';
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
import { Badge } from '@/components/ui/badge';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from '@/lib/utils';

const getStatusVariant = (status: Invoice['paymentStatus']): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case 'Paid':
      return 'default';
    case 'Partial':
      return 'outline';
    case 'Unpaid':
      return 'secondary';
    case 'Overdue':
      return 'destructive';
    default:
      return 'secondary';
  }
};

export default function ViewInvoicePage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customerInvoices, setCustomerInvoices] = useState<Invoice[]>([]);
  const [logo, setLogo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [isPaying, setIsPaying] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [totalCustomerOutstanding, setTotalCustomerOutstanding] = useState(0);
  const invoiceRef = useRef<HTMLDivElement>(null);

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

            // Fetch all invoices for this customer
            if (loadedInvoice.customerPhone) {
              const response = await fetch(`/api/invoices?customerPhone=${loadedInvoice.customerPhone}`);
              if (response.ok) {
                const customerInvoicesData = await response.json();
                setCustomerInvoices(customerInvoicesData);
                
                // Calculate total outstanding
                const total = customerInvoicesData.reduce((sum: number, inv: Invoice) => 
                  sum + (inv.grandTotal - (inv.amountPaid || 0)), 0);
                setTotalCustomerOutstanding(total);
              }
            }
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
      const totalDue = Number(invoice.grandTotal) + Number(invoice.previousOutstanding || 0);
      const newBalanceDue = totalDue - newAmountPaid;
      
      let newPaymentStatus: Invoice['paymentStatus'] = 'Unpaid';
      if (newAmountPaid >= totalDue) {
        newPaymentStatus = 'Paid';
      } else if (newAmountPaid > 0) {
        newPaymentStatus = 'Partial';
      }

      const newPayment = {
        id: crypto.randomUUID(),
        amount: amount,
        date: new Date().toISOString(),
        notes: `Payment received against invoice #${invoice.invoiceNumber}`
      };

      const updatedInvoice = {
        ...invoice,
        amountPaid: newAmountPaid,
        balanceDue: newBalanceDue,
        paymentStatus: newPaymentStatus,
        paymentHistory: [...(invoice.paymentHistory || []), newPayment]
      };

      await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedInvoice),
      });
      setInvoice(updatedInvoice);
      
      // Refresh customer invoices to update the running balance
      if (invoice.customerPhone) {
        const response = await fetch(`/api/invoices?customerPhone=${invoice.customerPhone}`);
        if (response.ok) {
          const customerInvoicesData = await response.json();
          setCustomerInvoices(customerInvoicesData);
          
          // Calculate total outstanding including all invoices and payments
          const total = customerInvoicesData.reduce((sum: number, inv: Invoice) => {
            const invoiceTotal = inv.grandTotal + (inv.previousOutstanding || 0);
            const paidAmount = inv.paymentHistory?.reduce((p: number, payment) => p + payment.amount, 0) || 0;
            return sum + (invoiceTotal - paidAmount);
          }, 0);
          
          setTotalCustomerOutstanding(total);
        }
      }

      setShowPaymentDialog(false);
      setPaymentAmount('');
      toast({ 
        title: 'Success', 
        description: `Payment of ₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} recorded successfully.` 
      });
    } catch (error) {
      console.error('Error recording payment:', error);
      toast({ title: 'Error', description: 'Failed to record payment.', variant: 'destructive' });
    } finally {
      setIsPaying(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!invoiceRef.current || !invoice) return;
    
    setIsDownloading(true);
    try {
      const canvas = await html2canvas(invoiceRef.current, {
        scale: 2,
        logging: false,
        useCORS: true
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const imgWidth = 210; // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      pdf.save(`Invoice-${invoice.invoiceNumber}.pdf`);
      
      toast({
        title: "Success",
        description: "Invoice downloaded successfully",
      });
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast({
        title: "Error",
        description: "Failed to download invoice",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    if (!invoice) return;
    
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Invoice #${invoice.invoiceNumber}`,
          text: `Invoice for ${invoice.customerName}`,
          url: window.location.href
        });
      } else {
        // Fallback to copying link to clipboard
        await navigator.clipboard.writeText(window.location.href);
        toast({
          title: "Link Copied",
          description: "Invoice link copied to clipboard",
        });
      }
    } catch (error) {
      console.error('Error sharing:', error);
      toast({
        title: "Error",
        description: "Failed to share invoice",
        variant: "destructive",
      });
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
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Download/Share
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={handleDownloadPDF} disabled={isDownloading}>
                <Download className="mr-2 h-4 w-4" />
                {isDownloading ? 'Downloading...' : 'Download PDF'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />
                Print Invoice
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleShare}>
                <Share2 className="mr-2 h-4 w-4" />
                Share Invoice
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

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

      <div ref={invoiceRef}>
        <InvoicePreview invoice={invoice} logoUrl={invoice.logoUrl || logo} />

        {/* Customer Payment History Section */}
        <div className="mt-8 print-hide">
          <h2 className="text-xl font-semibold mb-4">Customer Payment History</h2>
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead className="text-right">Previous Balance</TableHead>
                  <TableHead className="text-right">Bill Amount</TableHead>
                  <TableHead className="text-right">Payment</TableHead>
                  <TableHead className="text-right">Running Balance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customerInvoices
                  .sort((a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime())
                  .reduce((acc: Array<any>, inv) => {
                    // Add invoice entry
                    acc.push({
                      date: inv.invoiceDate,
                      invoiceNumber: inv.invoiceNumber,
                      previousBalance: inv.previousOutstanding || 0,
                      billAmount: inv.grandTotal,
                      payment: 0,
                      id: inv.id,
                      type: 'invoice',
                      status: inv.paymentStatus
                    });
                    
                    // Add payment entries if any
                    if (inv.paymentHistory && inv.paymentHistory.length > 0) {
                      inv.paymentHistory.forEach(payment => {
                        acc.push({
                          date: payment.date,
                          invoiceNumber: inv.invoiceNumber,
                          previousBalance: 0,
                          billAmount: 0,
                          payment: payment.amount,
                          id: payment.id,
                          type: 'payment',
                          status: 'Payment'
                        });
                      });
                    }
                    return acc;
                  }, [])
                  .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
                  .map((entry, index, array) => {
                    // Calculate running balance
                    const runningBalance = array
                      .slice(0, index + 1)
                      .reduce((sum, e) => sum + e.previousBalance + e.billAmount - e.payment, 0);
                    
                    return (
                      <TableRow 
                        key={entry.id} 
                        className={cn(
                          entry.type === 'payment' && "bg-muted/30",
                          entry.id === invoice?.id && "bg-primary/10"
                        )}
                      >
                        <TableCell>{formatDate(entry.date)}</TableCell>
                        <TableCell>
                          {entry.type === 'invoice' ? (
                            <Link href={`/invoices/${entry.id}`} className="hover:underline">
                              {entry.invoiceNumber}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground text-sm">
                              Payment for {entry.invoiceNumber}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {entry.previousBalance > 0 ? `₹${entry.previousBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {entry.billAmount > 0 ? `₹${entry.billAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          {entry.payment > 0 ? `₹${entry.payment.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                        </TableCell>
                        <TableCell className={cn(
                          "text-right font-medium",
                          runningBalance > 0 ? "text-red-600" : runningBalance < 0 ? "text-green-600" : ""
                        )}>
                          {formatCurrency(Math.abs(runningBalance))}
                          {runningBalance !== 0 && (runningBalance > 0 ? " DR" : " CR")}
                        </TableCell>
                        <TableCell>
                          {entry.type === 'payment' ? (
                            <Badge variant="outline" className="bg-green-50">Payment</Badge>
                          ) : (
                            <Badge variant={getStatusVariant(entry.status)}>
                              {entry.status}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5}>Current Outstanding Balance</TableCell>
                  <TableCell className="text-right font-bold text-red-600">
                    {totalCustomerOutstanding > 0 ? formatCurrency(totalCustomerOutstanding) + " DR" : formatCurrency(0)}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </div>

        {/* Current Invoice Payment History */}
        <div className="mt-8 print-hide">
          <h2 className="text-xl font-semibold mb-4">Current Invoice Payments</h2>
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice?.paymentHistory && invoice.paymentHistory.length > 0 ? (
                  invoice.paymentHistory.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>{new Date(payment.date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">{formatCurrency(payment.amount)}</TableCell>
                      <TableCell>{payment.notes || '-'}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">No payments recorded</TableCell>
                  </TableRow>
                )}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Total Paid</TableCell>
                  <TableCell className="text-right">{formatCurrency(invoice?.amountPaid || 0)}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Balance Due</TableCell>
                  <TableCell className="text-right">{formatCurrency(invoice?.balanceDue || 0)}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </div>
      </div>

      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block mb-1 font-medium">Outstanding Amount</label>
              <div className="mb-2">{formatCurrency(invoice.balanceDue)}</div>
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
