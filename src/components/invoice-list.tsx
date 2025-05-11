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
import { Eye, Edit, Trash2, Search, ArrowLeft, ArrowRight, Plus } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const [statusFilter, setStatusFilter] = useState<string>('all');

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
    return invoices
      .filter(invoice => {
        const matchesSearch = 
          invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
          invoice.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          invoice.customerPhone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          formatDate(invoice.invoiceDate).toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesStatus = statusFilter === 'all' || invoice.paymentStatus === statusFilter;
        
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime());
  }, [invoices, searchTerm, statusFilter]);

  const totalPages = Math.ceil(filteredInvoices.length / ITEMS_PER_PAGE);
  const paginatedInvoices = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredInvoices.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredInvoices, currentPage]);

  // Compute entry numbers and recent status for each invoice by customer phone
  const entryInfo = useMemo(() => {
    // Group invoices by customerPhone and sort by invoiceDate ascending
    const groups: Record<string, Invoice[]> = {};
    invoices.forEach(inv => {
      if (!groups[inv.customerPhone]) groups[inv.customerPhone] = [];
      groups[inv.customerPhone].push(inv);
    });
    Object.values(groups).forEach(list => list.sort((a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime()));
    // Map invoice id to entry number and recent status
    const map: Record<string, { number: number, isRecent: boolean }> = {};
    Object.values(groups).forEach(list => {
      list.forEach((inv, idx) => {
        map[inv.id] = {
          number: idx + 1,
          isRecent: idx === list.length - 1
        };
      });
    });
    return map;
  }, [invoices]);

  const handleDeleteClick = async (id: string, invoiceNumber: string) => {
    try {
      await deleteInvoice(id);
      setInvoices((prevInvoices) =>
        prevInvoices.filter((invoice) => invoice.id !== id)
      );
      onDelete(id);
      toast({
        title: "Success",
        description: `Invoice #${invoiceNumber} deleted successfully.`,
      });
    } catch (error) {
      console.error('Error deleting invoice:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete invoice",
        variant: "destructive",
      });
    }
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex gap-4 w-full md:w-auto">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by invoice #, customer name, phone, or date..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Invoices</SelectItem>
              <SelectItem value="Paid">Paid</SelectItem>
              <SelectItem value="Partial">Partial</SelectItem>
              <SelectItem value="Unpaid">Unpaid</SelectItem>
              <SelectItem value="Overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Link href="/invoices/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create New Invoice
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={handlePreviousPage} disabled={currentPage === 1}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleNextPage} disabled={currentPage === totalPages}>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {paginatedInvoices.length > 0 ? (
        <div className="border rounded-lg overflow-hidden shadow">
            <Table>
            <TableHeader className="bg-muted/50">
                <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
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
                    <TableCell className="font-medium">
                      {invoice.invoiceNumber}
                      {invoice.customerPhone && (
                        <Badge variant="secondary" className="ml-2">
                          {entryInfo[invoice.id]?.isRecent
                            ? 'Recent'
                            : entryInfo[invoice.id]?.number === 1
                            ? '1st Invoice'
                            : entryInfo[invoice.id]?.number === 2
                            ? '2nd Invoice'
                            : entryInfo[invoice.id]?.number === 3
                            ? '3rd Invoice'
                            : `${entryInfo[invoice.id]?.number}th Invoice`}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{invoice.customerName}</TableCell>
                    <TableCell>{invoice.customerPhone || '-'}</TableCell>
                    <TableCell>{formatDate(invoice.invoiceDate)}</TableCell>
                    <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(invoice.grandTotal) || 0)}</TableCell>
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
          No invoices found{searchTerm || statusFilter !== 'all' ? ' matching your filters' : ''}.
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center text-sm text-muted-foreground">
          Page {currentPage} of {totalPages}
        </div>
      )}
    </div>
  );
}
