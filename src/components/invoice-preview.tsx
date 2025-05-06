"use client";

import type { Invoice } from '@/types/invoice';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatCurrency, formatDate } from '@/lib/utils';
import { Badge } from "@/components/ui/badge";
import { useRef, useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Download, Printer, Share2 } from 'lucide-react';

// Declare html2pdf type
declare global {
  interface Window {
    html2pdf: any;
  }
}

interface InvoicePreviewProps {
  invoice: Invoice;
  logoUrl?: string | null;
}

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

export function InvoicePreview({ invoice, logoUrl }: InvoicePreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [html2pdfLoaded, setHtml2pdfLoaded] = useState(false);

  // Ensure we have valid data with proper number conversion and default values
  const items = invoice?.items || [];
  const previousPendingAmounts = invoice?.previousPendingAmounts || [];
  const totalPendingAmount = Number(invoice?.totalPendingAmount || 0);
  const grandTotal = Number(invoice?.grandTotal || 0);
  const amountPaid = Number(invoice?.amountPaid || 0);
  const previousOutstanding = Number(invoice?.previousOutstanding || 0);

  // Calculate balances
  const totalAmountDue = grandTotal + totalPendingAmount;
  const currentOutstanding = totalAmountDue - amountPaid;

  // Safe date formatting
  const formatSafeDate = (date: string | Date | undefined) => {
    if (!date) return '-';
    try {
      return formatDate(date);
    } catch (error) {
      console.error('Error formatting date:', error);
      return '-';
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      import('html2pdf.js').then((html2pdf) => {
        window.html2pdf = html2pdf.default;
        setHtml2pdfLoaded(true);
      });
    }
  }, []);

  const handleDownload = async () => {
    if (!contentRef.current || !html2pdfLoaded) return;
    
    try {
      const element = contentRef.current;
      const opt = {
        margin: 1,
        filename: `invoice-${invoice.invoiceNumber}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
      };

      await window.html2pdf().set(opt).from(element).save();
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  const handleShareWhatsApp = async () => {
    if (!previewRef.current || !html2pdfLoaded) return;
    
    const element = previewRef.current;
    const opt = {
      margin: 0.5,
      filename: `invoice_${invoice.invoiceNumber}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    element.classList.add('print-styles');
    try {
      const pdfBlob = await window.html2pdf().from(element).set(opt).output('blob');
      const pdfFile = new File([pdfBlob], `invoice_${invoice.invoiceNumber}.pdf`, { type: 'application/pdf' });
      
      const shareData = {
        files: [pdfFile],
        title: `Invoice #${invoice.invoiceNumber}`,
        text: `Invoice #${invoice.invoiceNumber} from AB INTERIORS`
      };

      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Invoice #${invoice.invoiceNumber} from AB INTERIORS`)}`;
        window.open(whatsappUrl, '_blank');
      }
    } catch (err) {
      console.error("Error sharing PDF:", err);
    } finally {
      element.classList.remove('print-styles');
    }
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end space-x-2 print-hide">
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" /> Print
        </Button>
        <Button variant="outline" size="sm" onClick={handleDownload}>
          <Download className="mr-2 h-4 w-4" /> Download PDF
        </Button>
        <Button variant="outline" size="sm" onClick={handleShareWhatsApp}>
          <Share2 className="mr-2 h-4 w-4" /> Share on WhatsApp
        </Button>
      </div>

      <div ref={previewRef} id="invoice-preview">
        <Card className="overflow-hidden shadow-lg border border-border print:shadow-none print:border-none">
          <CardHeader className="bg-primary print-bg-primary text-primary-foreground print-text-primary-foreground p-6">
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-3xl font-bold">AB INTERIORS</CardTitle>
                <p>Laroo Opposite Petrol Pump, Kulgam, 192231</p>
                <p>Phone: +91 6005523074</p>
                <p>Email: abinteriors@gmail.com</p>
              </div>
              {logoUrl && (
                <img src={logoUrl} alt="Company Logo" className="h-20 w-auto object-contain max-w-[150px]" />
              )}
            </div>
          </CardHeader>

          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <h3 className="font-semibold mb-2 text-foreground print-text-foreground">Bill To:</h3>
                <div className="text-sm text-muted-foreground print-text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground print-text-foreground">{invoice.customerName}</p>
                  <p>{invoice.customerAddress || '-'}</p>
                  {invoice.customerPhone && <p>Phone: {invoice.customerPhone}</p>}
                  {invoice.customerGst && <p>GST: {invoice.customerGst}</p>}
                </div>
              </div>

              <div className="text-sm text-muted-foreground print-text-muted-foreground md:text-right space-y-1">
                <div><span className="font-semibold text-foreground print-text-foreground">Invoice #:</span> {invoice.invoiceNumber}</div>
                <div><span className="font-semibold text-foreground print-text-foreground">Invoice Date:</span> {formatSafeDate(invoice.invoiceDate)}</div>
                <div><span className="font-semibold text-foreground print-text-foreground">Due Date:</span> {formatSafeDate(invoice.dueDate)}</div>
                <div className="flex items-center justify-end gap-1">
                  <span className="font-semibold text-foreground print-text-foreground">Status:</span>
                  <Badge variant={getStatusVariant(invoice.paymentStatus)}>{invoice.paymentStatus}</Badge>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-secondary print-bg-secondary print-border">
                  <TableRow>
                    <TableHead className="w-[5%] print-border">#</TableHead>
                    <TableHead className="w-[25%] print-border">Item</TableHead>
                    <TableHead className="w-[30%] print-border">Description</TableHead>
                    <TableHead className="w-[10%] text-right print-border">Qty</TableHead>
                    <TableHead className="w-[15%] text-right print-border">Rate (₹)</TableHead>
                    <TableHead className="w-[15%] text-right print-border">Amount (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={item.id || index} className="print-border">
                      <TableCell className="print-border">{index + 1}</TableCell>
                      <TableCell className="font-medium print-border">{item.name}</TableCell>
                      <TableCell className="text-muted-foreground print-border">{item.description || '-'}</TableCell>
                      <TableCell className="text-right print-border">{item.quantity}</TableCell>
                      <TableCell className="text-right print-border">{formatCurrency(Number(item.rate || 0))}</TableCell>
                      <TableCell className="text-right font-semibold print-border">{formatCurrency(Number(item.total || 0))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {previousPendingAmounts.length > 0 && (
              <Card className="border-destructive">
                <CardHeader className="bg-destructive/10">
                  <CardTitle className="text-destructive">Previous Pending Amounts</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previousPendingAmounts.map((pending) => (
                        <TableRow key={pending.invoiceId}>
                          <TableCell>
                            <div className="space-y-1">
                              <span className="font-medium">{pending.invoiceNumber}</span>
                              <span className="text-xs text-muted-foreground block">Due: {formatSafeDate(pending.date)}</span>
                            </div>
                          </TableCell>
                          <TableCell>{formatSafeDate(pending.date)}</TableCell>
                          <TableCell className="text-right text-destructive">{formatCurrency(Number(pending.amount || 0))}</TableCell>
                          <TableCell>
                            <Badge variant={getStatusVariant(pending.status)}>
                              {pending.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-destructive font-semibold">Total Previous Balance:</span>
                      <span className="text-destructive font-semibold">{formatCurrency(totalPendingAmount)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      This amount includes outstanding balances from {previousPendingAmounts.length} previous invoice{previousPendingAmounts.length > 1 ? 's' : ''}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="mt-8 flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Invoice Amount:</span>
                  <span>{formatCurrency(grandTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount Paid:</span>
                  <span>{formatCurrency(amountPaid)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-destructive font-semibold">Previous Outstanding:</span>
                  <span className="text-destructive font-semibold">{formatCurrency(totalPendingAmount)}</span>
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  From: {previousPendingAmounts.map(p => p.invoiceNumber).join(', ')}
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Total Amount Due:</span>
                  <span>{formatCurrency(totalAmountDue)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg">
                  <span>Current Outstanding:</span>
                  <span>{formatCurrency(currentOutstanding)}</span>
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="p-6 text-center text-xs text-muted-foreground print-text-muted-foreground border-t border-border mt-6">
            System Generated Invoice
          </CardFooter>
        </Card>
      </div>

      <style jsx global>{`
        @media print {
          .print-styles {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .print-styles .print-bg-primary { background-color: hsl(var(--primary)) !important; color: hsl(var(--primary-foreground)) !important; }
          .print-styles .print-bg-secondary { background-color: hsl(var(--secondary)) !important; }
          .print-styles .print-text-foreground { color: hsl(var(--foreground)) !important; }
          .print-styles .print-text-muted-foreground { color: hsl(var(--muted-foreground)) !important; }
          .print-styles .print-border { border: 1px solid hsl(var(--border)) !important; border-collapse: collapse !important; }
          .print-styles table { width: 100% !important; }
          .print-styles th, .print-styles td { padding: 8px !important; }
          .print-styles thead { display: table-header-group !important; }
          .print-styles tr { page-break-inside: avoid !important; }
        }
        :not(print) > style[jsx][global] {
          display: none;
        }
      `}</style>
    </div>
  );
}
