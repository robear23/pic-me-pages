import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";

const variables = [
  { key: "{customerName}", description: "Customer's name" },
  { key: "{childName}", description: "Child's name" },
  { key: "{interests}", description: "List of selected interests" },
  { key: "{orderId}", description: "Order number" },
  { key: "{orderDate}", description: "Date of order" },
  { key: "{totalAmount}", description: "Order total" },
];

export function EmailVariableReference() {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${text} to clipboard`);
  };

  return (
    <Card className="bg-background/50 backdrop-blur-sm border-white/20">
      <CardHeader>
        <CardTitle className="text-lg">Available Variables</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Use these variables in your email content. They will be replaced with actual customer data when emails are sent.
        </p>
        <div className="space-y-2">
          {variables.map((variable) => (
            <div
              key={variable.key}
              className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors group"
            >
              <div>
                <code className="text-sm font-mono bg-yellow-100 dark:bg-yellow-900/30 px-2 py-1 rounded text-yellow-800 dark:text-yellow-200">
                  {variable.key}
                </code>
                <p className="text-sm text-muted-foreground mt-1">
                  {variable.description}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => copyToClipboard(variable.key)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
