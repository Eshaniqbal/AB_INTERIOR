"use client";

import type { Invoice, InvoiceItem } from '@/types/invoice';
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
import { Trash2, PlusCircle, Upload, CalendarIcon } from 'lucide-react';
import { formatCurrency, generateInvoiceNumber, formatDate } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const itemSchema = z.object({
  id: z.string().optional(), // Keep optional for new items
  name: z.string().min(1, "Item name is required"),
  quantity: z.coerce.number().min(0.01, "Quantity must be positive"),
  rate: z.coerce.number().min(0, "Rate cannot be negative"),
  description: z.string().optional(),
  total: z.number().optional(), // Calculated, not directly validated in form schema
});

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
  paymentStatus: z.enum(['Paid', 'Partial', 'Unpaid', 'Overdue']).default('Unpaid'),
  logoUrl: z.string().optional().nullable(),
});

type InvoiceFormData = z.infer<typeof invoiceSchema>;

interface InvoiceFormProps {
  initialData?: Invoice | null;
  onSubmit: (data: Invoice) => void;
  onCancel: () => void;
  logo: string | null;
  onLogoUpload: (file: File) => void;
  onLogoDelete: () => void;
}

export function InvoiceForm({ initialData, onSubmit, onCancel, logo, onLogoUpload, onLogoDelete }: InvoiceFormProps) {
  const [localLogo, setLocalLogo] = useState<string | null>(logo);

   const defaultValues: Partial<InvoiceFormData> = useMemo(() => initialData
    ? {
        ...initialData,
        invoiceDate: initialData.invoiceDate ? new Date(initialData.invoiceDate) : new Date(),
        dueDate: initialData.dueDate ? new Date(initialData.dueDate) : new Date(new Date().setDate(new Date().getDate() + 15)), // Default due date 15 days from now
        items: initialData.items.map(item => ({ ...item, total: (item.quantity || 0) * (item.rate || 0) })), // Pre-calculate total
        amountPaid: initialData.amountPaid ?? 0,
        paymentStatus: initialData.paymentStatus ?? 'Unpaid',
        logoUrl: initialData.logoUrl ?? logo,
      }
    : {
        invoiceNumber: generateInvoiceNumber(),
        invoiceDate: new Date(),
        dueDate: new Date(new Date().setDate(new Date().getDate() + 15)),
        items: [{ id: crypto.randomUUID(), name: '', quantity: 1, rate: 0, description: '', total: 0 }],
        amountPaid: 0,
        paymentStatus: 'Unpaid',
        logoUrl: logo,
      }, [initialData, logo]); // Depend on initialData and logo

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

  const balanceDue = useMemo(() => {
    const amountPaidNumber = Number(watchedAmountPaid) || 0;
    return grandTotal - amountPaidNumber;
  }, [grandTotal, watchedAmountPaid]);

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
            if (amountPaidNumber >= grandTotal) {
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
    }, [watchedAmountPaid, grandTotal, balanceDue, watchedDueDate, setValue, watch]);


  const handleLogoUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onLogoUpload(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLocalLogo(reader.result as string);
        setValue('logoUrl', reader.result as string, { shouldDirty: true });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogoDelete = () => {
      onLogoDelete();
      setLocalLogo(null);
      setValue('logoUrl', null, { shouldDirty: true });
  }

   useEffect(() => {
    // Update local logo state if the prop changes externally (e.g., loaded from storage)
    setLocalLogo(logo);
    setValue('logoUrl', logo, { shouldDirty: false }); // Update form state without marking dirty initially
  }, [logo, setValue]);


  useEffect(() => {
     // Reset form when initialData changes (e.g., navigating from new to edit)
     // Recalculate defaultValues inside useEffect to ensure it runs when dependencies change
      const resetData: Partial<InvoiceFormData> = initialData
        ? {
            ...initialData,
            invoiceDate: initialData.invoiceDate ? new Date(initialData.invoiceDate) : new Date(),
            dueDate: initialData.dueDate ? new Date(initialData.dueDate) : new Date(new Date().setDate(new Date().getDate() + 15)),
            items: initialData.items.map(item => ({ ...item, total: (item.quantity || 0) * (item.rate || 0) })),
            amountPaid: initialData.amountPaid ?? 0,
            paymentStatus: initialData.paymentStatus ?? 'Unpaid',
            logoUrl: initialData.logoUrl ?? logo,
        }
        : {
            invoiceNumber: generateInvoiceNumber(),
            invoiceDate: new Date(),
            dueDate: new Date(new Date().setDate(new Date().getDate() + 15)),
            items: [{ id: crypto.randomUUID(), name: '', quantity: 1, rate: 0, description: '', total: 0 }],
            amountPaid: 0,
            paymentStatus: 'Unpaid',
            logoUrl: logo,
        };
      reset(resetData);
  }, [initialData, reset, logo]);

  const processSubmit = (data: InvoiceFormData) => {
    // Recalculate final totals and status based on submitted data
    const finalItems = data.items.map(item => ({
      ...item,
      id: item.id || crypto.randomUUID(),
      total: (Number(item.quantity) || 0) * (Number(item.rate) || 0),
      description: item.description || '', // Ensure description is always a string
    }));

    const calculatedGrandTotal = finalItems.reduce((sum, item) => sum + item.total, 0);
    const amountPaidNumber = Number(data.amountPaid) || 0;
    const calculatedBalanceDue = calculatedGrandTotal - amountPaidNumber;

    let calculatedPaymentStatus: 'Paid' | 'Partial' | 'Unpaid' | 'Overdue' = 'Unpaid';
    if (amountPaidNumber > 0) {
        if(amountPaidNumber >= calculatedGrandTotal) {
            calculatedPaymentStatus = 'Paid';
        } else {
            calculatedPaymentStatus = 'Partial';
        }
    }
     // Check for Overdue only if not Paid or Partial and balance is positive
    if (calculatedPaymentStatus === 'Unpaid' && calculatedBalanceDue > 0 && data.dueDate && new Date(data.dueDate) < new Date()) {
            calculatedPaymentStatus = 'Overdue';
    }

    const finalData: Invoice = {
      id: initialData?.id || crypto.randomUUID(),
      invoiceNumber: data.invoiceNumber,
      invoiceDate: data.invoiceDate.toISOString(),
      dueDate: data.dueDate.toISOString(),
      customerName: data.customerName,
      customerAddress: data.customerAddress,
      customerPhone: data.customerPhone || '',
      customerGst: data.customerGst || '',
      items: finalItems,
      grandTotal: calculatedGrandTotal,
      amountPaid: amountPaidNumber,
      balanceDue: calculatedBalanceDue,
      paymentStatus: data.paymentStatus ?? calculatedPaymentStatus,
      logoUrl: localLogo,
    };
    onSubmit(finalData);
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
            <div className="flex flex-col items-end space-y-2">
                 {localLogo ? (
                    <div className="relative group">
                        <img src={localLogo} alt="Company Logo" className="h-20 w-auto object-contain" />
                         <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity print-hide h-6 w-6"
                            onClick={handleLogoDelete}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                ) : (
                    <div className="relative">
                         <Button type="button" variant="secondary" size="sm" className="print-hide" onClick={() => document.getElementById('logo-upload')?.click()}>
                             <Upload className="mr-2 h-4 w-4" /> Upload Logo
                         </Button>
                         <Input
                             id="logo-upload"
                             type="file"
                             accept="image/*"
                             className="absolute inset-0 w-full h-full opacity-0 cursor-pointer print-hide"
                             onChange={handleLogoUpload}
                         />
                     </div>
                )}
            </div>
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
                        <Input {...register(`items.${index}.name`)} placeholder="Item Name" className="w-full" aria-invalid={errors.items?.[index]?.name ? "true" : "false"} />
                        {errors.items?.[index]?.name && <p className="text-destructive text-sm mt-1">{errors.items?.[index]?.name?.message}</p>}
                      </TableCell>
                      <TableCell>
                        <Input {...register(`items.${index}.description`)} placeholder="Description (Optional)" className="w-full" />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          {...register(`items.${index}.quantity`)}
                          placeholder="1"
                          className="w-full text-right"
                          aria-invalid={errors.items?.[index]?.quantity ? "true" : "false"}
                        />
                        {errors.items?.[index]?.quantity && <p className="text-destructive text-sm mt-1">{errors.items?.[index]?.quantity?.message}</p>}
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
                    <span>Grand Total:</span>
                     {/* Display calculated grand total */}
                    <span>₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center font-semibold text-primary">
                    <span>Balance Due:</span>
                     {/* Display calculated balance due */}
                    <span>₹{balanceDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
            </div>
          </div>
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
