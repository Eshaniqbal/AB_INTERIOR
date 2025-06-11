import type { Invoice } from '@/types/invoice';

const INVOICES_KEY = 'ab_interiors_invoices';
const LOGO_KEY = 'ab_interiors_logo';

// Invoice Operations
export const saveInvoices = async (invoices: Invoice[]): Promise<void> => {
  try {
    for (const invoice of invoices) {
      await fetch('/api/invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invoice),
      });
    }
  } catch (error) {
    console.error('Error saving invoices:', error);
    throw error;
  }
};

export const loadInvoices = async (): Promise<Invoice[]> => {
  try {
    const response = await fetch('/api/invoices');
    if (!response.ok) {
      throw new Error('Failed to load invoices');
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error loading invoices:', error);
    return [];
  }
};

export const addInvoice = async (invoice: Invoice): Promise<void> => {
  try {
    const response = await fetch('/api/invoices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(invoice),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to add invoice');
    }
  } catch (error) {
    console.error('Error adding invoice:', error);
    throw error;
  }
};

export const updateInvoice = async (updatedInvoice: Invoice): Promise<void> => {
  try {
    const response = await fetch(`/api/invoices/${updatedInvoice.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updatedInvoice),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update invoice');
    }
  } catch (error) {
    console.error('Error updating invoice:', error);
    throw error;
  }
};

export const getInvoiceById = async (id: string): Promise<Invoice | null> => {
  try {
    const response = await fetch(`/api/invoices/${id}`);
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error('Failed to get invoice');
    }
    return await response.json();
  } catch (error) {
    console.error('Error getting invoice:', error);
    return null;
  }
};

export async function deleteInvoice(id: string): Promise<void> {
  try {
    const response = await fetch(`/api/invoices/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to delete invoice');
    }
  } catch (error) {
    console.error('Error deleting invoice:', error);
    throw error;
  }
}

// Logo Operations
export const saveLogo = async (logoUrl: string): Promise<void> => {
  try {
    const response = await fetch('/api/company', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ logoUrl }),
    });

    if (!response.ok) {
      throw new Error('Failed to save logo');
    }
  } catch (error) {
    console.error('Error saving logo:', error);
    throw error;
  }
};

export const loadLogo = async (): Promise<string | null> => {
  try {
    const response = await fetch('/api/company');
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return data?.logoUrl || null;
  } catch (error) {
    console.error('Error loading logo:', error);
    return null;
  }
};

export const deleteLogo = async (): Promise<void> => {
  try {
    const response = await fetch('/api/company', {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('Failed to delete logo');
    }
  } catch (error) {
    console.error('Error deleting logo:', error);
    throw error;
  }
};

export const getLatestInvoiceByCustomerPhone = async (customerPhone: string): Promise<Invoice | null> => {
  try {
    const response = await fetch(`/api/invoices?customerPhone=${encodeURIComponent(customerPhone)}`);
    if (!response.ok) {
      throw new Error('Failed to fetch latest invoice');
    }
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      const sortedInvoices = data.sort((a, b) => 
        new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime()
      );
      return sortedInvoices[0];
    }
    return null;
  } catch (error) {
    console.error('Error fetching latest invoice:', error);
    return null;
  }
};
