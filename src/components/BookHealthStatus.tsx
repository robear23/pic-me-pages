import { AlertCircle, CheckCircle, Clock, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";

interface BookHealthStatusProps {
  books: any[];
  retryCreditCount: number;
}

export const BookHealthStatus = ({ books, retryCreditCount }: BookHealthStatusProps) => {
  const completed = books.filter(b => b.status === 'completed' && b.pdf_url && b.cover_url).length;
  const partial = books.filter(b => b.status === 'partial' || (b.status === 'completed' && (!b.pdf_url || !b.cover_url))).length;
  const processing = books.filter(b => b.status === 'processing').length;
  const failed = books.filter(b => b.status === 'failed').length;

  const stats = [
    { label: 'Complete', count: completed, icon: CheckCircle, variant: 'default' as const, color: 'text-green-500' },
    { label: 'Partial', count: partial, icon: AlertCircle, variant: 'secondary' as const, color: 'text-yellow-500' },
    { label: 'Processing', count: processing, icon: Clock, variant: 'outline' as const, color: 'text-blue-500' },
    { label: 'Failed', count: failed, icon: XCircle, variant: 'destructive' as const, color: 'text-red-500' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Book Health Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center p-4 rounded-lg border">
              <stat.icon className={`h-6 w-6 mb-2 ${stat.color}`} />
              <div className="text-2xl font-bold">{stat.count}</div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
        
        {retryCreditCount > 0 && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
            <span className="text-sm font-medium">Retry Credits Available</span>
            <Badge variant="default">{retryCreditCount}</Badge>
          </div>
        )}
        
        {partial > 0 && (
          <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <AlertCircle className="inline h-4 w-4 mr-1" />
              {partial} book{partial !== 1 ? 's' : ''} partially completed. Missing covers or PDFs can be regenerated.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
