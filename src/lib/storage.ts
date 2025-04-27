
import type { Invoice } from '@/types/invoice';

const INVOICES_KEY = 'ab_interiors_invoices';
const LOGO_KEY = 'ab_interiors_logo';

// Invoice Operations
export const saveInvoices = (invoices: Invoice[]): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(INVOICES_KEY, JSON.stringify(invoices));
  }
};

export const loadInvoices = (): Invoice[] => {
  if (typeof window !== 'undefined') {
    const storedInvoices = localStorage.getItem(INVOICES_KEY);
    return storedInvoices ? JSON.parse(storedInvoices) : [];
  }
  return [];
};

export const addInvoice = (newInvoice: Invoice): void => {
  const invoices = loadInvoices();
  invoices.push(newInvoice);
  saveInvoices(invoices);
};

export const updateInvoice = (updatedInvoice: Invoice): void => {
  const invoices = loadInvoices();
  const index = invoices.findIndex(inv => inv.id === updatedInvoice.id);
  if (index !== -1) {
    invoices[index] = updatedInvoice;
    saveInvoices(invoices);
  }
};


export const getInvoiceById = (id: string): Invoice | undefined => {
  const invoices = loadInvoices();
  return invoices.find(inv => inv.id === id);
};

export const deleteInvoice = (id: string): void => {
  let invoices = loadInvoices();
  invoices = invoices.filter(inv => inv.id !== id);
  saveInvoices(invoices);
};

// Logo Operations
export const saveLogo = (logoDataUrl: string): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(LOGO_KEY, logoDataUrl);
  }
};

export const loadLogo = (): string | null => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(LOGO_KEY);
  }
  return null;
};

export const deleteLogo = (): void => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(LOGO_KEY);
  }
};
