"use client";

import type { Invoice, PaymentHistory } from '@/types/invoice';
import { useState, useEffect, ChangeEvent, useMemo } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Trash2, PlusCircle, Upload, CalendarIcon, Search, Check } from 'lucide-react';
import { formatCurrency, generateInvoiceNumber, formatDate } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import { addInvoice, loadInvoices, getLatestInvoiceByCustomerPhone } from '@/lib/storage';
import { Badge } from "@/components/ui/badge";
import type { Stock } from '@/types/stock';
import { Command, CommandInput, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { LogoUpload } from '@/components/logo-upload';

const itemSchema = z.object({
  id: z.string().optional(), // Keep optional for new items
  name: z.string().min(1, "Item name is required"),
  quantity: z.coerce.number().min(0.01, "Quantity must be positive"),
  rate: z.coerce.number().min(0, "Rate cannot be negative"),
  description: z.string().optional(),
  total: z.number().optional(), // Calculated, not directly validated in form schema
  stockId: z.string().optional(),
  availableQuantity: z.number().optional(),
});

type FormItem = z.infer<typeof itemSchema>;

const invoiceSchema = z.object({
  id: z.string().optional(), // Optional for new invoices
  invoiceNumber: z.string().min(1, "Invoice number is required"),
  invoiceDate: z.date({ required_error: "Invoice date is required" }),
  dueDate: z.date({ required_error: "Due date is required" }),
  customerName: z.string().min(1, "Customer name is required"),
  customerAddress: z.string().min(1, "Customer address is required"),
  customerPhone: z.string().optional(),
  customerGst: z.string().optional(),
  items: z.array(itemSchema).min(1, "At least one item is required"),
  amountPaid: z.coerce.number().min(0, "Amount paid cannot be negative").default(0),
  previousOutstanding: z.coerce.number().min(0, "Previous outstanding cannot be negative").default(0),
  paymentStatus: z.enum(['Paid', 'Partial', 'Unpaid', 'Overdue']).default('Unpaid'),
  logoUrl: z.string().nullable().optional(),
});

type InvoiceFormData = z.infer<typeof invoiceSchema>;

interface InvoiceFormProps {
  initialData?: Invoice | null;
  onSubmit: (data: Invoice) => void;
  onCancel: () => void;
  availableStocks?: Stock[];
}

export function InvoiceForm({ 
  initialData, 
  onSubmit, 
  onCancel,
  availableStocks = [] 
}: InvoiceFormProps) {
  const [localLogo, setLocalLogo] = useState<string | null>(initialData?.logoUrl);
  const [previousPendingAmounts, setPreviousPendingAmounts] = useState<Array<{
    invoiceId: string;
    invoiceNumber: string;
    amount: number;
    date: string;
    status: 'Paid' | 'Partial' | 'Unpaid' | 'Overdue';
  }>>([]);
  const [totalPendingAmount, setTotalPendingAmount] = useState<number>(0);
  const [isLoadingPrevious, setIsLoadingPrevious] = useState(false);
  const router = useRouter();

   const defaultValues: Partial<InvoiceFormData> = useMemo(() => initialData
    ? {
        ...initialData,
        invoiceDate: initialData.invoiceDate ? new Date(initialData.invoiceDate) : new Date(),
        dueDate: initialData.dueDate ? new Date(initialData.dueDate) : new Date(new Date().setDate(new Date().getDate() + 15)), // Default due date 15 days from now
        items: initialData.items?.map(item => ({ 
          ...item, 
          total: (item.quantity || 0) * (item.rate || 0) 
        })) || [{ id: crypto.randomUUID(), name: '', quantity: 1, rate: 0, description: '', total: 0 }],
        amountPaid: initialData.amountPaid ?? 0,
        previousOutstanding: initialData.previousOutstanding ?? 0,
        paymentStatus: initialData.paymentStatus ?? 'Unpaid',
        logoUrl: initialData.logoUrl ?? localLogo,
      }
    : {
        invoiceNumber: generateInvoiceNumber(),
        invoiceDate: new Date(),
        dueDate: new Date(new Date().setDate(new Date().getDate() + 15)),
        items: [{ id: crypto.randomUUID(), name: '', quantity: 1, rate: 0, description: '', total: 0 }],
        amountPaid: 0,
        previousOutstanding: 0,
        paymentStatus: 'Unpaid',
        logoUrl: localLogo,
      }, [initialData, localLogo]); // Depend on initialData and localLogo

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
    reset,
  } = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues,
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });

  const watchedItems = watch('items');
  const watchedAmountPaid = watch('amountPaid');
  const watchedPreviousOutstanding = watch('previousOutstanding');
  const watchedDueDate = watch('dueDate');

  // Function to calculate item total
  const calculateItemTotal = (quantity: number, rate: number) => {
    return (Number(quantity) || 0) * (Number(rate) || 0);
  };

  // Calculate totals directly from watched values
  const grandTotal = useMemo(() => {
    return watchedItems.reduce((sum, item) => {
      return sum + calculateItemTotal(item.quantity, item.rate);
    }, 0);
  }, [watchedItems]);

  const totalAmountDue = useMemo(() => {
    return grandTotal + totalPendingAmount;
  }, [grandTotal, totalPendingAmount]);

  const balanceDue = useMemo(() => {
    const amountPaidNumber = Number(watchedAmountPaid) || 0;
    return totalAmountDue - amountPaidNumber;
  }, [totalAmountDue, watchedAmountPaid]);

  // Update item total when quantity or rate changes
  useEffect(() => {
    watchedItems.forEach((item, index) => {
      const total = calculateItemTotal(item.quantity, item.rate);
      setValue(`items.${index}.total`, total, { shouldValidate: true });
    });
  }, [watchedItems, setValue]);

   // Update paymentStatus based on calculated totals and due date using useEffect
   useEffect(() => {
        const amountPaidNumber = Number(watchedAmountPaid) || 0;
        let newPaymentStatus: 'Paid' | 'Partial' | 'Unpaid' | 'Overdue' = 'Unpaid';

        if (amountPaidNumber > 0) {
            if (amountPaidNumber >= totalAmountDue) {
                newPaymentStatus = 'Paid';
            } else {
                newPaymentStatus = 'Partial';
            }
        }

        // Check for Overdue only if not Paid or Partial and balance is positive
        if (newPaymentStatus === 'Unpaid' && balanceDue > 0 && watchedDueDate && new Date(watchedDueDate) < new Date()) {
             newPaymentStatus = 'Overdue';
        }

        // Only update if the status has actually changed
        const currentPaymentStatus = watch('paymentStatus');
        if (currentPaymentStatus !== newPaymentStatus) {
            setValue('paymentStatus', newPaymentStatus, { shouldValidate: true, shouldDirty: true });
        }
    }, [watchedAmountPaid, totalAmountDue, balanceDue, watchedDueDate, setValue, watch]);


  useEffect(() => {
     // Reset form when initialData changes (e.g., navigating from new to edit)
     // Recalculate defaultValues inside useEffect to ensure it runs when dependencies change
      const resetData: Partial<InvoiceFormData> = initialData
        ? {
            ...initialData,
            invoiceDate: initialData.invoiceDate ? new Date(initialData.invoiceDate) : new Date(),
            dueDate: initialData.dueDate ? new Date(initialData.dueDate) : new Date(new Date().setDate(new Date().getDate() + 15)),
            items: initialData.items?.map(item => ({ 
              ...item, 
              total: (item.quantity || 0) * (item.rate || 0) 
            })) || [{ id: crypto.randomUUID(), name: '', quantity: 1, rate: 0, description: '', total: 0 }],
            amountPaid: initialData.amountPaid ?? 0,
            previousOutstanding: initialData.previousOutstanding ?? 0,
            paymentStatus: initialData.paymentStatus ?? 'Unpaid',
            logoUrl: initialData.logoUrl ?? localLogo,
        }
        : {
            invoiceNumber: generateInvoiceNumber(),
            invoiceDate: new Date(),
            dueDate: new Date(new Date().setDate(new Date().getDate() + 15)),
            items: [{ id: crypto.randomUUID(), name: '', quantity: 1, rate: 0, description: '', total: 0 }],
            amountPaid: 0,
            previousOutstanding: 0,
            paymentStatus: 'Unpaid',
            logoUrl: localLogo,
        };
      reset(resetData);
  }, [initialData, reset, localLogo]);

  const fetchPreviousOutstanding = async () => {
    try {
      setIsLoadingPrevious(true);
      const customerPhone = watch('customerPhone');
      if (!customerPhone) {
        toast({
          title: "Error",
          description: "Please enter customer phone number first",
          variant: "destructive",
        });
        return;
      }

      const latestInvoice = await getLatestInvoiceByCustomerPhone(customerPhone);
      if (latestInvoice) {
        // Calculate the actual pending amount from the latest invoice
        const pendingAmount = Number(latestInvoice.previousOutstanding || 0) + 
                            Number(latestInvoice.grandTotal || 0) - 
                            Number(latestInvoice.amountPaid || 0);

        // Update the state with previous pending amounts
        setPreviousPendingAmounts([{
          invoiceId: latestInvoice.id,
          invoiceNumber: latestInvoice.invoiceNumber,
          amount: pendingAmount,
          date: latestInvoice.dueDate,
          status: latestInvoice.paymentStatus
        }]);

        // Update the total pending amount
        setTotalPendingAmount(pendingAmount);

        toast({
          title: "Previous Records Found",
          description: `Found previous balance of ${formatCurrency(pendingAmount)}`,
        });
      } else {
        setPreviousPendingAmounts([]);
        setTotalPendingAmount(0);
        toast({
          title: "No Records",
          description: "No previous invoice found for this customer",
        });
      }
    } catch (error) {
      console.error('Error fetching previous outstanding:', error);
      toast({
        title: "Error",
        description: "Failed to fetch previous outstanding.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingPrevious(false);
    }
  };

  const processSubmit = async (data: InvoiceFormData) => {
    try {
      const items = data.items.map(item => ({
        ...item,
        total: (item.quantity || 0) * (item.rate || 0),
        id: item.id || crypto.randomUUID(),
        description: item.description || ''
      }));

      // Fetch only the latest invoice for this customer
      let previousOutstanding = 0;
      if (data.customerPhone) {
        const latestInvoice = await getLatestInvoiceByCustomerPhone(data.customerPhone);
        previousOutstanding = latestInvoice ? Number(latestInvoice.previousOutstanding || 0) + Number(latestInvoice.grandTotal || 0) - Number(latestInvoice.amountPaid || 0) : 0;
      }

      // Calculate totals including previous outstanding
      const currentInvoiceTotal = items.reduce((sum, item) => sum + (item.total || 0), 0);
      const totalAmountDue = currentInvoiceTotal + previousOutstanding;
      const balanceDue = totalAmountDue - data.amountPaid;

      // Determine payment status
      let paymentStatus: 'Paid' | 'Partial' | 'Unpaid' | 'Overdue' = 'Unpaid';
      if (data.amountPaid > 0) {
        if (data.amountPaid >= totalAmountDue) {
          paymentStatus = 'Paid';
        } else {
          paymentStatus = 'Partial';
        }
      } else if (balanceDue > 0 && new Date(data.dueDate) < new Date()) {
        paymentStatus = 'Overdue';
      }

      const invoice: Invoice = {
        id: initialData?.id || crypto.randomUUID(),
        invoiceNumber: data.invoiceNumber,
        invoiceDate: data.invoiceDate.toISOString(),
        dueDate: data.dueDate.toISOString(),
        customerName: data.customerName,
        customerAddress: data.customerAddress,
        customerPhone: data.customerPhone || '',
        customerGst: data.customerGst || '',
        items: items,
        grandTotal: currentInvoiceTotal,
        amountPaid: data.amountPaid,
        balanceDue: balanceDue,
        paymentStatus: paymentStatus,
        logoUrl: data.logoUrl || undefined,
        previousPendingAmounts: previousPendingAmounts,
        totalPendingAmount: previousOutstanding,
        previousOutstanding: previousOutstanding,
        note: previousOutstanding > 0 ? `Includes previous outstanding balance of ${formatCurrency(previousOutstanding)} from last invoice` : undefined
      };

      await addInvoice(invoice);
      toast({
        title: "Success",
        description: `Invoice saved successfully${previousOutstanding > 0 ? ` with previous outstanding balance of ${formatCurrency(previousOutstanding)}` : ''}.`,
      });
      router.push('/invoices');
    } catch (error) {
      console.error('Error saving invoice:', error);
      toast({
        title: "Error",
        description: "Failed to save invoice. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Add this helper function for status badges
  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'Paid':
        return 'default';
      case 'Partial':
        return 'outline';
      case 'Overdue':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const attachPreviousBalance = () => {
    if (totalPendingAmount > 0) {
      try {
        // Update the previous outstanding amount in the form
        setValue('previousOutstanding', totalPendingAmount);

        // Get current form values
        const currentItems = watch('items');
        const currentAmountPaid = watch('amountPaid') || 0;
        
        // Calculate new totals
        const currentInvoiceTotal = currentItems.reduce((sum, item) => sum + ((item.quantity || 0) * (item.rate || 0)), 0);
        const newTotalAmountDue = currentInvoiceTotal + totalPendingAmount;
        const newBalanceDue = newTotalAmountDue - currentAmountPaid;

        // Update payment status based on new totals
        let newPaymentStatus: 'Paid' | 'Partial' | 'Unpaid' | 'Overdue' = 'Unpaid';
        if (currentAmountPaid > 0) {
          if (currentAmountPaid >= newTotalAmountDue) {
            newPaymentStatus = 'Paid';
          } else {
            newPaymentStatus = 'Partial';
          }
        } else if (newBalanceDue > 0 && new Date(watch('dueDate')) < new Date()) {
          newPaymentStatus = 'Overdue';
        }

        // Update form state
        setValue('paymentStatus', newPaymentStatus);

        // Show success message with detailed information
        toast({
          title: "Previous Balance Attached",
          description: `Previous balance of ${formatCurrency(totalPendingAmount)} added. New total amount due: ${formatCurrency(newTotalAmountDue)}. Balance due: ${formatCurrency(newBalanceDue)}`,
        });
      } catch (error) {
        console.error('Error attaching previous balance:', error);
        toast({
          title: "Error",
          description: "Failed to attach previous balance. Please try again.",
          variant: "destructive",
        });
      }
    } else {
      toast({
        title: "No Previous Balance",
        description: "There is no previous balance to attach.",
        variant: "default",
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(processSubmit)} className="space-y-6">
      <Card className="overflow-hidden shadow-lg">
        <CardHeader className="bg-primary print-bg-primary text-primary-foreground print-text-primary-foreground">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-3xl font-bold">AB INTERIORS</CardTitle>
              <div className="mt-2">
                <p>Laroo Opposite Petrol Pump, Kulgam, 192231</p>
                <p>Phone: +91 6005523074</p>
                <p>Email: abinteriors@gmail.com</p>
              </div>
            </div>
            <LogoUpload />
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* Invoice Details & Customer Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Bill To Section */}
             <Card className="p-4 border border-border">
                <h3 className="font-semibold mb-2 text-primary">Bill To:</h3>
                 <div className="space-y-2">
                    <div>
                        <Label htmlFor="customerName">Customer Name</Label>
                        <Input id="customerName" {...register('customerName')} aria-invalid={errors.customerName ? "true" : "false"} />
                        {errors.customerName && <p className="text-destructive text-sm mt-1">{errors.customerName.message}</p>}
                    </div>
                     <div>
                        <Label htmlFor="customerAddress">Address</Label>
                        <Textarea id="customerAddress" {...register('customerAddress')} aria-invalid={errors.customerAddress ? "true" : "false"} />
                        {errors.customerAddress && <p className="text-destructive text-sm mt-1">{errors.customerAddress.message}</p>}
                    </div>
                     <div>
                        <Label htmlFor="customerPhone">Phone</Label>
                        <Input id="customerPhone" {...register('customerPhone')} />
                         {errors.customerPhone && <p className="text-destructive text-sm mt-1">{errors.customerPhone.message}</p>}
                    </div>
                   
                 </div>
             </Card>


            {/* Invoice Meta Section */}
             <Card className="p-4 border border-border">
                <h3 className="font-semibold mb-2 text-primary">Invoice Details:</h3>
                <div className="space-y-2">
                    <div>
                        <Label htmlFor="invoiceNumber">Invoice Number</Label>
                        <Input id="invoiceNumber" {...register('invoiceNumber')} aria-invalid={errors.invoiceNumber ? "true" : "false"} />
                        {errors.invoiceNumber && <p className="text-destructive text-sm mt-1">{errors.invoiceNumber.message}</p>}
                    </div>
                    <div>
                        <Label>Invoice Date</Label>
                         <Controller
                            name="invoiceDate"
                            control={control}
                            render={({ field }) => (
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-full justify-start text-left font-normal",
                                            !field.value && "text-muted-foreground"
                                        )}
                                        >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {field.value ? formatDate(field.value) : <span>Pick a date</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar
                                        mode="single"
                                        selected={field.value}
                                        onSelect={field.onChange}
                                        initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>
                            )}
                            />
                        {errors.invoiceDate && <p className="text-destructive text-sm mt-1">{errors.invoiceDate.message}</p>}
                    </div>
                     <div>
                        <Label>Due Date</Label>
                         <Controller
                            name="dueDate"
                            control={control}
                            render={({ field }) => (
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-full justify-start text-left font-normal",
                                            !field.value && "text-muted-foreground"
                                        )}
                                        >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {field.value ? formatDate(field.value) : <span>Pick a date</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar
                                        mode="single"
                                        selected={field.value}
                                        onSelect={field.onChange}
                                        initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>
                            )}
                         />
                        {errors.dueDate && <p className="text-destructive text-sm mt-1">{errors.dueDate.message}</p>}
                    </div>
                </div>
             </Card>
          </div>

          {/* Items Table */}
          <div className="overflow-x-auto">
             <h3 className="font-semibold mb-2 text-primary">Items:</h3>
            <Table>
              <TableHeader className="bg-secondary print-bg-secondary">
                <TableRow>
                  <TableHead className="w-[25%]">Item Name</TableHead>
                  <TableHead className="w-[30%]">Description</TableHead>
                  <TableHead className="w-[10%] text-right">Qty</TableHead>
                  <TableHead className="w-[15%] text-right">Rate (₹)</TableHead>
                  <TableHead className="w-[15%] text-right">Total (₹)</TableHead>
                  <TableHead className="w-[5%] print-hide">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((field, index) => {
                  const itemTotal = calculateItemTotal(watchedItems[index]?.quantity, watchedItems[index]?.rate);
                  return (
                    <TableRow key={field.id}>
                      <TableCell>
                        <Select
                          onValueChange={(value) => {
                            const selectedStock = availableStocks.find(stock => stock._id === value);
                            if (selectedStock) {
                              const items = [...watch('items')] as FormItem[];
                              items[index] = {
                                ...items[index],
                                name: selectedStock.name,
                                stockId: selectedStock._id,
                                availableQuantity: selectedStock.quantity,
                                quantity: Math.min(items[index].quantity || 1, selectedStock.quantity),
                                rate: items[index].rate || 0,
                                total: Math.min(items[index].quantity || 1, selectedStock.quantity) * (items[index].rate || 0)
                              };
                              setValue('items', items);
                            }
                          }}
                          value={watch(`items.${index}.stockId`) || undefined}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select an item" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableStocks.map((stock) => (
                              <SelectItem key={stock._id} value={stock._id || 'default'}>
                                {stock.name} (Available: {stock.quantity})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {errors.items?.[index]?.name && (
                          <p className="text-destructive text-sm mt-1">{errors.items?.[index]?.name?.message}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input {...register(`items.${index}.description`)} placeholder="Description (Optional)" className="w-full" />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          {...register(`items.${index}.quantity`)}
                          onChange={(e) => {
                            const value = e.target.value;
                            const numValue = parseFloat(value) || 0;
                            const items = [...watch('items')] as FormItem[];
                            const item = items[index];
                            
                            items[index] = {
                              ...item,
                              quantity: item.stockId && item.availableQuantity !== undefined
                                ? Math.min(Math.max(0, numValue), item.availableQuantity)
                                : Math.max(0, numValue),
                              total: (item.stockId && item.availableQuantity !== undefined
                                ? Math.min(Math.max(0, numValue), item.availableQuantity)
                                : Math.max(0, numValue)) * (item.rate || 0)
                            };
                            
                            setValue('items', items);
                          }}
                          placeholder="1"
                          className="w-full text-right"
                          aria-invalid={errors.items?.[index]?.quantity ? "true" : "false"}
                        />
                        {(watch('items')[index] as FormItem)?.stockId && (
                          <small className="text-muted-foreground">
                            Available: {(watch('items')[index] as FormItem)?.availableQuantity}
                          </small>
                        )}
                        {errors.items?.[index]?.quantity && (
                          <p className="text-destructive text-sm mt-1">{errors.items?.[index]?.quantity?.message}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          {...register(`items.${index}.rate`)}
                          placeholder="0.00"
                          className="w-full text-right"
                          aria-invalid={errors.items?.[index]?.rate ? "true" : "false"}
                          onChange={(e) => {
                            const value = e.target.value;
                            // Remove prefix zeros and update the value
                            const cleanValue = value.replace(/^0+/, '') || '0';
                            setValue(`items.${index}.rate`, Number(cleanValue), { shouldValidate: true });
                          }}
                        />
                        {errors.items?.[index]?.rate && <p className="text-destructive text-sm mt-1">{errors.items?.[index]?.rate?.message}</p>}
                      </TableCell>
                      <TableCell className="text-right font-medium">₹{itemTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                      <TableCell className="print-hide">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive/80"
                          onClick={() => fields.length > 1 && remove(index)}
                          disabled={fields.length <= 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {errors.items && typeof errors.items === 'object' && !Array.isArray(errors.items) && <p className="text-destructive text-sm mt-1">{errors.items.message}</p>}

             <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4 print-hide"
              onClick={() => append({ id: crypto.randomUUID(), name: '', quantity: 1, rate: 0, description: '', total: 0 })}
            >
              <PlusCircle className="mr-2 h-4 w-4" /> Add Item
            </Button>
          </div>

          {/* Totals and Payment Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
             {/* Payment Status */}
            <div className="space-y-2">
                 <Label htmlFor="paymentStatus">Payment Status</Label>
                 <Controller
                    name="paymentStatus"
                    control={control}
                    render={({ field }) => (
                         // Use field.value which is updated by the useEffect hook
                        <Select onValueChange={field.onChange} value={field.value}>
                            <SelectTrigger id="paymentStatus" className="w-full md:w-[200px]">
                                <SelectValue placeholder="Select Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Unpaid">Unpaid</SelectItem>
                                <SelectItem value="Partial">Partial</SelectItem>
                                <SelectItem value="Paid">Paid</SelectItem>
                                <SelectItem value="Overdue">Overdue</SelectItem>
                            </SelectContent>
                        </Select>
                    )}
                    />
                 {errors.paymentStatus && <p className="text-destructive text-sm mt-1">{errors.paymentStatus.message}</p>}
            </div>

            {/* Totals Section */}
            <div className="space-y-2 text-right">
                <div className="flex justify-between items-center">
                    <Label>Previous Outstanding (₹):</Label>
                    <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        id="previousOutstanding"
                        {...register('previousOutstanding')}
                        className="w-[120px] text-right"
                        aria-invalid={errors.previousOutstanding ? "true" : "false"}
                        value={totalPendingAmount}
                        readOnly
                    />
                </div>
                 {errors.previousOutstanding && <p className="text-destructive text-sm mt-1">{errors.previousOutstanding.message}</p>}

                <div className="flex justify-between items-center">
                    <Label>Amount Paid (₹):</Label>
                    <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        id="amountPaid"
                        {...register('amountPaid')}
                        className="w-[120px] text-right"
                        aria-invalid={errors.amountPaid ? "true" : "false"}
                    />
                </div>
                 {errors.amountPaid && <p className="text-destructive text-sm mt-1">{errors.amountPaid.message}</p>}

                <div className="flex justify-between items-center font-semibold">
                    <span>Current Invoice Amount:</span>
                     {/* Display calculated grand total */}
                    <span>₹{formatCurrency(grandTotal)}</span>
                </div>

                <div className="flex justify-between items-center font-semibold">
                    <span>Total Amount Due:</span>
                     {/* Display calculated total amount due */}
                    <span>₹{formatCurrency(totalAmountDue)}</span>
                </div>

                <div className="flex justify-between items-center font-semibold text-primary">
                    <span>Balance Due:</span>
                     {/* Display calculated balance due */}
                    <span>₹{formatCurrency(balanceDue)}</span>
                </div>
            </div>
          </div>

          {/* Previous Pending Amounts Section */}
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Previous Pending Amounts</h3>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={fetchPreviousOutstanding}
                disabled={isLoadingPrevious}
              >
                {isLoadingPrevious ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2"></div>
                    Loading...
                  </div>
                ) : (
                  "Fetch Previous Records"
                )}
              </Button>
              {totalPendingAmount > 0 && (
                <Button
                  type="button"
                  variant="default"
                  onClick={attachPreviousBalance}
                >
                  Attach Previous Balance
                </Button>
              )}
            </div>
          </div>

          {previousPendingAmounts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Previous Pending Amounts</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previousPendingAmounts.map((pending) => (
                      <TableRow key={pending.invoiceId}>
                        <TableCell>{pending.invoiceNumber}</TableCell>
                        <TableCell>{formatDate(pending.date)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(pending.amount)}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(pending.status)}>
                            {pending.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="mt-4 text-right">
                  <p className="text-lg font-semibold">
                    Total Pending Amount: {formatCurrency(totalPendingAmount)}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>

        <CardFooter className="flex justify-between p-6 bg-secondary print-bg-secondary print-hide">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" className="bg-accent text-accent-foreground hover:bg-accent/90">
            {initialData ? 'Update Invoice' : 'Save Invoice'}
          </Button>
        </CardFooter>
      </Card>
       <div className="text-center text-xs text-muted-foreground mt-4 print:block hidden">
            System Generated Invoice - My Awesome Store
        </div>
    </form>
  );
}