
"use client";

import { useState, useEffect, useMemo } from 'react';
import type { Invoice } from '@/types/invoice';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Eye, Edit, Trash2, Search, ArrowLeft, ArrowRight } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { deleteInvoice } from '@/lib/storage';
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

interface InvoiceListProps {
  invoices: Invoice[];
  onDelete: (id: string) => void; // Callback to update parent state after deletion
}

const ITEMS_PER_PAGE = 10;

const getStatusVariant = (status: Invoice['paymentStatus']): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case 'Paid':
      return 'default';
    case 'Partial':
      return 'outline'; // Use a different visual cue
    case 'Unpaid':
      return 'secondary';
    case 'Overdue':
      return 'destructive';
    default:
      return 'secondary';
  }
};

export function InvoiceList({ invoices: initialInvoices, onDelete }: InvoiceListProps) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);

   // Update local state if the prop changes
   useEffect(() => {
    setInvoices(initialInvoices);
    // Reset to first page if the underlying data changes significantly
    // You might want more sophisticated logic here depending on the use case
    if(currentPage !== 1) {
      setCurrentPage(1);
    }
   }, [initialInvoices]);


  const filteredInvoices = useMemo(() => {
    return invoices.filter(invoice =>
      invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      formatDate(invoice.invoiceDate).toLowerCase().includes(searchTerm.toLowerCase())
    ).sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime()); // Sort by newest first
  }, [invoices, searchTerm]);

  const totalPages = Math.ceil(filteredInvoices.length / ITEMS_PER_PAGE);
  const paginatedInvoices = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredInvoices.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredInvoices, currentPage]);

  const handleDeleteClick = (id: string, invoiceNumber: string) => {
      setInvoices((prevInvoices) =>
        prevInvoices.filter((invoice) => invoice.id !== id)
      );
    deleteInvoice(id);
    onDelete(id); 
    toast({
      title: "Success",
      description: `Invoice #${invoiceNumber} deleted successfully.`,
    });
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by Invoice #, Customer, Date..."
            value={searchTerm}
            onChange={(e) => {
                setSearchTerm(e.target.value);
                if(currentPage !== 1) {
                  setCurrentPage(1);
                }
            }}
            className="pl-8 w-full"
          />
        </div>
         <Link href="/invoices/new" passHref>
            <Button>Create New Invoice</Button>
        </Link>
      </div>

      {paginatedInvoices.length > 0 ? (
        <div className="border rounded-lg overflow-hidden shadow">
            <Table>
            <TableHeader className="bg-muted/50">
                <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Amount (₹)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {paginatedInvoices.map((invoice) => (
                <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                    <TableCell>{invoice.customerName}</TableCell>
                    <TableCell>{formatDate(invoice.invoiceDate)}</TableCell>
                    <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(invoice.grandTotal)}</TableCell>
                    <TableCell>
                    <Badge variant={getStatusVariant(invoice.paymentStatus)}>
                        {invoice.paymentStatus}
                    </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                    <div className="flex justify-end space-x-1">
                        <Link href={`/invoices/${invoice.id}`} passHref>
                         <Button variant="ghost" size="icon" aria-label="View Invoice">
                             <Eye className="h-4 w-4" />
                        </Button>
                        </Link>
                         <Link href={`/invoices/${invoice.id}/edit`} passHref>
                             <Button variant="ghost" size="icon" aria-label="Edit Invoice">
                                <Edit className="h-4 w-4" />
                             </Button>
                        </Link>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                 <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive/80" aria-label="Delete Invoice">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This action cannot be undone. This will permanently delete invoice <span className="font-semibold">#{invoice.invoiceNumber}</span>.
                                </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteClick(invoice.id, invoice.invoiceNumber)} className="bg-destructive hover:bg-destructive/90">
                                    Delete
                                </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                         </AlertDialog>
                    </div>
                    </TableCell>
                </TableRow>
                ))}
            </TableBody>
            </Table>
        </div>
      ) : (
        <div className="text-center py-10 text-muted-foreground border rounded-lg shadow">
          No invoices found{searchTerm ? ' matching your search' : ''}.
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-between items-center pt-4">
           <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreviousPage}
              disabled={currentPage === 1}
            >
               <ArrowLeft className="mr-1 h-4 w-4"/> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
            >
               Next <ArrowRight className="ml-1 h-4 w-4"/>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
