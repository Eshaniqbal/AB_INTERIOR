import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster"; // Import Toaster
import { cn } from "@/lib/utils";

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
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
    <html lang="en">
      <body
        className={cn(
          `${geistSans.variable} ${geistMono.variable} antialiased bg-secondary`, // Use secondary color for background
          "min-h-screen"
        )}
      >
        <main className="container mx-auto px-4 py-8">{children}</main>
        <Toaster /> {/* Add Toaster component here */}
      </body>
    </html>
  );
}
