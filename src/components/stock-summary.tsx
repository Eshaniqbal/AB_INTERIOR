import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stock } from "@/types/stock";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface StockSummaryProps {
  stocks: Stock[];
}

export function StockSummary({ stocks }: StockSummaryProps) {
  // Calculate total items and total quantity
  const totalItems = stocks.length;
  const totalQuantity = stocks.reduce((sum, stock) => sum + stock.quantity, 0);

  // Get top 5 items by quantity for the chart
  const chartData = stocks
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5)
    .map(stock => ({
      name: stock.name,
      quantity: stock.quantity
    }));

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 mb-8">
      {/* Summary Cards */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Stock Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col">
              <span className="text-2xl font-bold">{totalItems}</span>
              <span className="text-muted-foreground">Total Items</span>
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold">{totalQuantity}</span>
              <span className="text-muted-foreground">Total Quantity</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chart Card */}
      <Card className="md:col-span-5">
        <CardHeader>
          <CardTitle>Top 5 Items by Quantity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 12 }}
                  interval={0}
                  tickFormatter={(value) => value.length > 10 ? `${value.substring(0, 10)}...` : value}
                />
                <YAxis />
                <Tooltip />
                <Bar dataKey="quantity" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 