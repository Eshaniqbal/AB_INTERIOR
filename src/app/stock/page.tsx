'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, Edit2, Save, X, Search } from 'lucide-react';
import type { Stock } from '@/types/stock';
import { toast } from 'sonner';
import { CSVUpload } from '@/components/csv-upload';
import { StockSummary } from '@/components/stock-summary';
import { LogoUpload } from '@/components/logo-upload';

export default function StockPage() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    quantity: '',
  });
  const [newStock, setNewStock] = useState({
    name: '',
    quantity: '',
  });

  useEffect(() => {
    fetchStocks();
  }, []);

  const fetchStocks = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/stock');
      if (!response.ok) {
        throw new Error('Failed to fetch stocks');
      }
      const data = await response.json();
      setStocks(data);
    } catch (error) {
      console.error('Error fetching stocks:', error);
      toast.error('Failed to fetch stocks');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const stockData = {
        ...newStock,
        quantity: Number(newStock.quantity),
      };

      const response = await fetch('/api/stock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(stockData),
      });

      if (!response.ok) {
        throw new Error('Failed to add stock');
      }

      setNewStock({
        name: '',
        quantity: '',
      });
      
      toast.success('Stock added successfully');
      fetchStocks();
    } catch (error) {
      console.error('Error adding stock:', error);
      toast.error('Failed to add stock');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/stock/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete stock');
      }

      toast.success('Stock deleted successfully');
      fetchStocks();
    } catch (error) {
      console.error('Error deleting stock:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete stock');
    }
  };

  const startEdit = (stock: Stock) => {
    setEditingId(stock._id || null);
    setEditForm({
      name: stock.name,
      quantity: stock.quantity.toString(),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({
      name: '',
      quantity: '',
    });
  };

  const handleEdit = async (id: string) => {
    try {
      const response = await fetch(`/api/stock/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: editForm.name,
          quantity: Number(editForm.quantity),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update stock');
      }

      toast.success('Stock updated successfully');
      setEditingId(null);
      fetchStocks();
    } catch (error) {
      console.error('Error updating stock:', error);
      toast.error('Failed to update stock');
    }
  };

  // Filter stocks based on search term
  const filteredStocks = stocks.filter(stock =>
    stock.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-start mb-8">
        <h1 className="text-3xl font-bold">Stock Management</h1>
        <LogoUpload />
      </div>

      <StockSummary stocks={stocks} />

      <div className="mb-8">
        <CSVUpload onUploadSuccess={fetchStocks} />
      </div>

      <div className="mb-8 p-6 border rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Add New Stock</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={newStock.name}
              onChange={(e) => setNewStock({ ...newStock, name: e.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              value={newStock.quantity}
              onChange={(e) => setNewStock({ ...newStock, quantity: e.target.value })}
              required
            />
          </div>
          <Button type="submit" className="col-span-2">Add Stock</Button>
        </form>
      </div>

      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Stock List</h2>
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search stocks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
        
        {loading ? (
          <div className="text-center py-4">Loading...</div>
        ) : filteredStocks.length === 0 ? (
          <div className="text-center py-4 text-gray-500">
            {searchTerm ? 'No matching stocks found' : 'No stocks found'}
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStocks.map((stock) => (
                  <TableRow key={stock._id}>
                    <TableCell>
                      {editingId === stock._id ? (
                        <Input
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        />
                      ) : (
                        stock.name
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === stock._id ? (
                        <Input
                          type="number"
                          value={editForm.quantity}
                          onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                        />
                      ) : (
                        stock.quantity
                      )}
                    </TableCell>
                    <TableCell className="flex gap-2">
                      {editingId === stock._id ? (
                        <>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleEdit(stock._id as string)}
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={cancelEdit}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => startEdit(stock)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(stock._id as string)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
} 