"use client";

import { useState, useEffect } from 'react';
import type { Worker } from '@/types/invoice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchWorkers = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/workers');
        const data = await res.json();
        setWorkers(data);
      } catch {
        setWorkers([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchWorkers();
  }, []);

  const filtered = workers.filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    (w.phone || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Workers Management</h1>
        <Link href="/workers/new">
          <Button>Add Worker</Button>
        </Link>
      </div>
      <Input
        placeholder="Search by name or phone..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="max-w-sm"
      />
      <div className="bg-white rounded shadow p-4">
        {isLoading ? (
          <div>Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-muted-foreground text-center">No workers found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Name</th>
                <th className="text-left py-2">Phone</th>
                <th className="text-left py-2">Monthly Salary</th>
                <th className="text-left py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(worker => (
                <tr key={worker.id} className="border-b hover:bg-muted/30">
                  <td>{worker.name}</td>
                  <td>{worker.phone || '-'}</td>
                  <td>{formatCurrency(worker.monthlySalary)}</td>
                  <td>
                    <Link href={`/workers/${worker.id}`}>
                      <Button variant="outline" size="sm">View</Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
} 