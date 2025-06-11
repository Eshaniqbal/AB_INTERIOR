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
  TableFooter,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Eye, Edit, Trash2, Search, ArrowLeft, ArrowRight, Plus, History } from 'lucide-react';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

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
  const [selectedCustomerPhone, setSelectedCustomerPhone] = useState<string | null>(null);

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

  // Group invoices by customer phone and calculate totals
  const customerBalances = useMemo(() => {
    const balances: Record<string, {
      customerName: string;
      invoices: Invoice[];
      totalBilled: number;
      totalPaid: number;
      totalPending: number;
      lastInvoiceDate: string;
    }> = {};

    invoices.forEach(invoice => {
      if (!invoice.customerPhone) return;

      if (!balances[invoice.customerPhone]) {
        balances[invoice.customerPhone] = {
          customerName: invoice.customerName,
          invoices: [],
          totalBilled: 0,
          totalPaid: 0,
          totalPending: 0,
          lastInvoiceDate: invoice.invoiceDate
        };
      }

      const balance = balances[invoice.customerPhone];
      balance.invoices.push(invoice);
      balance.totalBilled += invoice.grandTotal + (invoice.previousOutstanding || 0);
      balance.totalPaid += invoice.amountPaid || 0;
      balance.totalPending = balance.totalBilled - balance.totalPaid;

      if (new Date(invoice.invoiceDate) > new Date(balance.lastInvoiceDate)) {
        balance.lastInvoiceDate = invoice.invoiceDate;
      }
    });

    return balances;
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
                <TableHead className="text-right">Balance Details</TableHead>
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
                    <TableCell>
                      <div className="flex items-center justify-between">
                        <div className="text-right space-y-1">
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">Bill Amount:</span>
                            <span>{formatCurrency(invoice.grandTotal)}</span>
                          </div>
                          {invoice.previousOutstanding > 0 && (
                            <div className="flex justify-between">
                              <span className="text-sm text-muted-foreground">Previous:</span>
                              <span className="text-destructive">+{formatCurrency(invoice.previousOutstanding)}</span>
                            </div>
                          )}
                          {invoice.amountPaid > 0 && (
                            <div className="flex justify-between">
                              <span className="text-sm text-muted-foreground">Paid:</span>
                              <span className="text-green-600">-{formatCurrency(invoice.amountPaid)}</span>
                            </div>
                          )}
                          <div className="flex justify-between font-medium border-t pt-1 mt-1">
                            <span className="text-sm">Balance:</span>
                            <span className={cn(
                              invoice.balanceDue > 0 ? "text-destructive" : "text-green-600"
                            )}>{formatCurrency(invoice.balanceDue)}</span>
                          </div>
                        </div>
                        {invoice.customerPhone && (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="ml-2"
                                onClick={() => setSelectedCustomerPhone(invoice.customerPhone)}
                              >
                                <History className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-3xl">
                              <DialogHeader>
                                <DialogTitle>Balance History - {invoice.customerName}</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                {/* Summary Card */}
                                <div className="grid grid-cols-3 gap-4">
                                  <div className="bg-secondary/20 p-4 rounded-lg">
                                    <div className="text-sm text-muted-foreground">Total Billed</div>
                                    <div className="text-2xl font-semibold">
                                      {formatCurrency(customerBalances[invoice.customerPhone].totalBilled)}
                                    </div>
                                  </div>
                                  <div className="bg-green-100 p-4 rounded-lg">
                                    <div className="text-sm text-muted-foreground">Total Paid</div>
                                    <div className="text-2xl font-semibold text-green-600">
                                      {formatCurrency(customerBalances[invoice.customerPhone].totalPaid)}
                                    </div>
                                  </div>
                                  <div className="bg-destructive/10 p-4 rounded-lg">
                                    <div className="text-sm text-muted-foreground">Total Pending</div>
                                    <div className="text-2xl font-semibold text-destructive">
                                      {formatCurrency(customerBalances[invoice.customerPhone].totalPending)}
                                    </div>
                                  </div>
                                </div>

                                {/* Detailed Transaction History */}
                                <div className="border rounded-lg">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Invoice #</TableHead>
                                        <TableHead className="text-right">Bill Amount</TableHead>
                                        <TableHead className="text-right">Previous</TableHead>
                                        <TableHead className="text-right">Paid</TableHead>
                                        <TableHead className="text-right">Balance</TableHead>
                                        <TableHead>Status</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {customerBalances[invoice.customerPhone].invoices
                                        .sort((a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime())
                                        .map((inv) => (
                                          <TableRow key={inv.id}>
                                            <TableCell>{formatDate(inv.invoiceDate)}</TableCell>
                                            <TableCell>
                                              <Link href={`/invoices/${inv.id}`} className="hover:underline">
                                                {inv.invoiceNumber}
                                              </Link>
                                            </TableCell>
                                            <TableCell className="text-right">
                                              {formatCurrency(inv.grandTotal)}
                                            </TableCell>
                                            <TableCell className="text-right text-destructive">
                                              {inv.previousOutstanding > 0 ? 
                                                formatCurrency(inv.previousOutstanding) : 
                                                '-'}
                                            </TableCell>
                                            <TableCell className="text-right text-green-600">
                                              {inv.amountPaid > 0 ? 
                                                formatCurrency(inv.amountPaid) : 
                                                '-'}
                                            </TableCell>
                                            <TableCell className={cn(
                                              "text-right font-medium",
                                              inv.balanceDue > 0 ? "text-destructive" : "text-green-600"
                                            )}>
                                              {formatCurrency(inv.balanceDue)}
                                            </TableCell>
                                            <TableCell>
                                              <Badge variant={getStatusVariant(inv.paymentStatus)}>
                                                {inv.paymentStatus}
                                              </Badge>
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                    </TableBody>
                                    <TableFooter>
                                      <TableRow>
                                        <TableCell colSpan={5}>Total Outstanding Balance</TableCell>
                                        <TableCell className="text-right font-bold text-destructive">
                                          {formatCurrency(customerBalances[invoice.customerPhone].totalPending)}
                                        </TableCell>
                                        <TableCell></TableCell>
                                      </TableRow>
                                    </TableFooter>
                                  </Table>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                        )}
                      </div>
                    </TableCell>
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
