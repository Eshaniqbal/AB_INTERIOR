import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { Toaster as SonnerToaster } from 'sonner';

const geistSans = Geist({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-geist-sans',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-geist-mono',
});

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
    <html lang="en" className={cn(geistSans.variable, geistMono.variable)}>
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
