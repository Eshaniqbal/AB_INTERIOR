
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { PlusCircle, List } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
      <Card className="w-full max-w-md text-center shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-primary">AB INTERIORS</CardTitle>
          <CardDescription className="text-muted-foreground">
            Your Simple Invoice Management Solution
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Link href="/invoices/new" passHref>
            <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
              <PlusCircle className="mr-2 h-5 w-5" /> Create New Invoice
            </Button>
          </Link>
          <Link href="/invoices" passHref>
            <Button variant="outline" className="w-full">
              <List className="mr-2 h-5 w-5" /> View Saved Invoices
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
