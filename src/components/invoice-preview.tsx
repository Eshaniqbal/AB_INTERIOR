"use client";

import type { Invoice } from '@/types/invoice';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatCurrency, formatDate } from '@/lib/utils';
import { Badge } from "@/components/ui/badge";
import { useRef } from 'react';
import html2pdf from 'html2pdf.js';
import { Button } from './ui/button';
import { Download, Printer, Share2 } from 'lucide-react';

interface InvoicePreviewProps {
  invoice: Invoice;
  logoUrl?: string | null;
}

const getStatusVariant = (status: Invoice['paymentStatus']): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case 'Paid':
      return 'default'; // Use primary color (or a success green if defined)
    case 'Partial':
      return 'outline'; // Use accent color
    case 'Unpaid':
      return 'secondary'; // Muted/secondary color
    case 'Overdue':
      return 'destructive'; // Destructive color
    default:
      return 'secondary';
  }
};


export function InvoicePreview({ invoice, logoUrl }: InvoicePreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null);

  const handleDownloadPdf = () => {
    const element = previewRef.current;
    if (element) {
      const opt = {
        margin:       0.5,
        filename:     `invoice_${invoice.invoiceNumber}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
      };
      element.classList.add('print-styles');
      html2pdf().from(element).set(opt).save().then(() => {
          element.classList.remove('print-styles');
      }).catch((err: Error) => {
          console.error("Error generating PDF:", err);
          element.classList.remove('print-styles');
      });
    }
  };

  const handleShareWhatsApp = async () => {
    const element = previewRef.current;
    if (element) {
      const opt = {
        margin:       0.5,
        filename:     `invoice_${invoice.invoiceNumber}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
      };
      element.classList.add('print-styles');
      try {
        const pdfBlob = await html2pdf().from(element).set(opt).output('blob');
        const pdfFile = new File([pdfBlob], `invoice_${invoice.invoiceNumber}.pdf`, { type: 'application/pdf' });
        
        // Create a temporary link to share the file
        const shareData = {
          files: [pdfFile],
          title: `Invoice #${invoice.invoiceNumber}`,
          text: `Invoice #${invoice.invoiceNumber} from AB INTERIORS`
        };

        if (navigator.share) {
          await navigator.share(shareData);
        } else {
          // Fallback for browsers that don't support Web Share API
          const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Invoice #${invoice.invoiceNumber} from AB INTERIORS`)}`;
          window.open(whatsappUrl, '_blank');
        }
      } catch (err) {
        console.error("Error sharing PDF:", err);
      } finally {
        element.classList.remove('print-styles');
      }
    }
  };

  const handlePrint = () => {
    window.print();
  }

  return (
    <div className="space-y-4">
        <div className="flex justify-end space-x-2 print-hide">
             <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
                <Download className="mr-2 h-4 w-4" /> Download PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handleShareWhatsApp}>
                <Share2 className="mr-2 h-4 w-4" /> Share on WhatsApp
            </Button>
        </div>

        {/* Add a wrapper with ref for html2pdf */}
        <div ref={previewRef} id="invoice-preview">
            <Card className="overflow-hidden shadow-lg border border-border print:shadow-none print:border-none">
                <CardHeader className="bg-primary print-bg-primary text-primary-foreground print-text-primary-foreground p-6">
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="text-3xl font-bold">AB INTERIORS</CardTitle>
                         {/* Static "Billing From" Details */}
                         <div className="mt-2 text-sm">
                            <p>Laroo Opposite Petrol Pump, Kulgam 192231</p>
                            <p>Phone: +91 6005523074</p>
                            <p>Email: abinteriors@gmail.com</p>
                            <p>GSTIN: OlAPAP10968QIZS</p>
                        </div>
                    </div>
                    {logoUrl && (
                        <img src={logoUrl} alt="Company Logo" className="h-20 w-auto object-contain max-w-[150px]" />
                    )}
                </div>
                </CardHeader>

                <CardContent className="p-6 space-y-6">
                {/* Invoice Details & Customer Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    {/* Bill To Section */}
                    <div>
                        <h3 className="font-semibold mb-2 text-foreground print-text-foreground">Bill To:</h3>
                        <div className="text-sm text-muted-foreground print-text-muted-foreground space-y-1">
                            <p className="font-medium text-foreground print-text-foreground">{invoice.customerName}</p>
                            <p>{invoice.customerAddress}</p>
                            {invoice.customerPhone && <p>Phone: {invoice.customerPhone}</p>}
                            {invoice.customerGst && <p>GST: {invoice.customerGst}</p>}
                        </div>
                    </div>

                    {/* Invoice Meta Section */}
                    <div className="text-sm text-muted-foreground print-text-muted-foreground md:text-right space-y-1">
                        <p><span className="font-semibold text-foreground print-text-foreground">Invoice #:</span> {invoice.invoiceNumber}</p>
                        <p><span className="font-semibold text-foreground print-text-foreground">Invoice Date:</span> {formatDate(invoice.invoiceDate)}</p>
                        <p><span className="font-semibold text-foreground print-text-foreground">Due Date:</span> {formatDate(invoice.dueDate)}</p>
                         <p><span className="font-semibold text-foreground print-text-foreground">Status:</span> <Badge variant={getStatusVariant(invoice.paymentStatus)} className="ml-1">{invoice.paymentStatus}</Badge></p>
                    </div>
                </div>

                {/* Items Table */}
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
                        {invoice.items.map((item, index) => (
                        <TableRow key={item.id || index} className="print-border">
                            <TableCell className="print-border">{index + 1}</TableCell>
                            <TableCell className="font-medium print-border">{item.name}</TableCell>
                             <TableCell className="text-muted-foreground print-border">{item.description || '-'}</TableCell>
                            <TableCell className="text-right print-border">{item.quantity}</TableCell>
                            <TableCell className="text-right print-border">{formatCurrency(item.rate)}</TableCell>
                            <TableCell className="text-right font-semibold print-border">{formatCurrency(item.total)}</TableCell>
                        </TableRow>
                        ))}
                    </TableBody>
                    </Table>
                </div>

                {/* Totals */}
                <div className="flex justify-end mt-6">
                    <div className="w-full max-w-xs space-y-2 text-sm">
                         <div className="flex justify-between">
                            <span className="text-muted-foreground print-text-muted-foreground">Subtotal:</span>
                            <span className="font-medium print-text-foreground">₹{invoice.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground print-text-muted-foreground">Amount Paid:</span>
                            <span className="font-medium print-text-foreground">₹{invoice.amountPaid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                         <div className="flex justify-between border-t border-border pt-2 mt-2">
                            <span className="font-semibold text-lg text-primary print-text-foreground">Balance Due:</span>
                            <span className="font-semibold text-lg text-primary print-text-foreground">₹{invoice.balanceDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                    </div>
                </div>
                </CardContent>

                <CardFooter className="p-6 text-center text-xs text-muted-foreground print-text-muted-foreground border-t border-border mt-6">
                     System Generated Invoice - AB INTERIORS
                </CardFooter>
            </Card>
        </div>
         {/* Add temporary CSS for printing within the component */}
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
             /* Hide this style tag in the browser */
            :not(print) > style[jsx][global] {
                display: none;
            }
        `}</style>
    </div>
  );
}
