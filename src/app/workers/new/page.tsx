"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';

export default function AddWorkerPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [joiningDate, setJoiningDate] = useState('');
  const [monthlySalary, setMonthlySalary] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !monthlySalary) {
      toast({ title: 'Error', description: 'Name and monthly salary are required.', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch('/api/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
          name,
          phone,
          address,
          joiningDate,
          monthlySalary: Number(monthlySalary),
        }),
      });
      if (!res.ok) throw new Error('Failed to add worker');
      toast({ title: 'Success', description: 'Worker added successfully.' });
      router.push('/workers');
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to add worker.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Add New Worker</h1>
      <form onSubmit={handleSubmit} className="space-y-4 bg-white rounded shadow p-6">
        <div>
          <label className="block mb-1 font-medium">Name *</label>
          <Input value={name} onChange={e => setName(e.target.value)} required disabled={isLoading} />
        </div>
        <div>
          <label className="block mb-1 font-medium">Phone</label>
          <Input value={phone} onChange={e => setPhone(e.target.value)} disabled={isLoading} />
        </div>
        <div>
          <label className="block mb-1 font-medium">Address</label>
          <Input value={address} onChange={e => setAddress(e.target.value)} disabled={isLoading} />
        </div>
        <div>
          <label className="block mb-1 font-medium">Joining Date</label>
          <Input type="date" value={joiningDate} onChange={e => setJoiningDate(e.target.value)} disabled={isLoading} />
        </div>
        <div>
          <label className="block mb-1 font-medium">Monthly Salary *</label>
          <Input type="number" min="0" value={monthlySalary} onChange={e => setMonthlySalary(e.target.value)} required disabled={isLoading} />
        </div>
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={() => router.push('/workers')} disabled={isLoading}>Cancel</Button>
          <Button type="submit" disabled={isLoading}>{isLoading ? 'Saving...' : 'Add Worker'}</Button>
        </div>
      </form>
    </div>
  );
} 