import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { Toaster as SonnerToaster } from 'sonner';

export const metadata: Metadata = {
  title: 'AB INTERIORS - Invoice Generator',
  description: 'Generate and manage invoices for AB INTERIORS.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={cn(
          "antialiased bg-secondary min-h-screen font-sans"
        )}
      >
        <main className="container mx-auto px-4 py-8">{children}</main>
        <Toaster />
        <SonnerToaster />
      </body>
    </html>
  );
}
