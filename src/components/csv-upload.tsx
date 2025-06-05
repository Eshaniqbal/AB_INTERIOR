'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import Papa from 'papaparse';

interface CSVUploadProps {
  onUploadSuccess: () => void;
}

export function CSVUpload({ onUploadSuccess }: CSVUploadProps) {
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
      toast.error('Please upload a valid CSV file');
      return;
    }

    setIsUploading(true);

    try {
      const text = await file.text();
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          if (results.errors.length > 0) {
            toast.error('Error parsing CSV file');
            console.error('CSV parsing errors:', results.errors);
            setIsUploading(false);
            return;
          }

          const stocks = results.data.map((row: any) => ({
            name: row.name?.trim(),
            quantity: parseInt(row.quantity) || 0
          })).filter(stock => stock.name && !isNaN(stock.quantity));

          if (stocks.length === 0) {
            toast.error('No valid stock data found in CSV');
            setIsUploading(false);
            return;
          }

          try {
            const response = await fetch('/api/stock/bulk', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ stocks }),
            });

            if (!response.ok) {
              throw new Error('Failed to upload stocks');
            }

            const result = await response.json();
            toast.success(`Successfully uploaded ${result.count} stocks`);
            onUploadSuccess();
          } catch (error) {
            console.error('Upload error:', error);
            toast.error('Failed to upload stocks');
          }
        },
      });
    } catch (error) {
      console.error('File reading error:', error);
      toast.error('Error reading CSV file');
    } finally {
      setIsUploading(false);
      event.target.value = ''; // Reset file input
    }
  };

  return (
    <div className="flex items-center gap-4">
      <input
        type="file"
        accept=".csv"
        onChange={handleFileUpload}
        className="hidden"
        id="csv-upload"
        disabled={isUploading}
      />
      <label
        htmlFor="csv-upload"
        className={`cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 ${isUploading ? 'opacity-50' : ''}`}
      >
        {isUploading ? 'Uploading...' : 'Upload CSV'}
      </label>
      <Button
        variant="outline"
        onClick={() => {
          const link = document.createElement('a');
          link.href = '/template.csv';
          link.download = 'stock_template.csv';
          link.click();
        }}
      >
        Download Template
      </Button>
    </div>
  );
} 