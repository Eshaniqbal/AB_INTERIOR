
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function generateInvoiceNumber(): string {
  // Simple example: AB-YYMMDD-XXXX (where XXXX is random)
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `AB-${year}${month}${day}-${randomPart}`;
}

export function formatDate(date: Date | string): string {
   try {
    const d = typeof date === 'string' ? new Date(date) : date;
    // Check if date is valid after parsing
    if (isNaN(d.getTime())) {
        console.warn("Invalid date provided to formatDate:", date);
        return "Invalid Date"; // Or return an empty string or today's date formatted
    }
    return d.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch (error) {
    console.error("Error formatting date:", date, error);
    return "Error Date"; // Return an error indicator
  }
}
