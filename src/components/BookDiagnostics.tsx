import { useState } from "react";
import { AlertCircle, CheckCircle, FileText, Image, Package, XCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";

interface BookDiagnosticsProps {
  book: any;
}

export const BookDiagnostics = ({ book }: BookDiagnosticsProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const components = [
    {
      name: 'Interior PDF',
      exists: !!book.pdf_url,
      url: book.pdf_url,
      icon: FileText,
      critical: true,
    },
    {
      name: 'Cover PDF',
      exists: !!book.cover_url,
      url: book.cover_url,
      icon: Package,
      critical: true,
    },
    {
      name: 'Front Cover Image',
      exists: !!book.cover_image_url,
      url: book.cover_image_url,
      icon: Image,
      critical: true,
    },
    {
      name: 'Back Cover Image',
      exists: !!book.back_cover_image_url,
      url: book.back_cover_image_url,
      icon: Image,
      critical: true,
    },
    {
      name: 'Generated Pages',
      exists: book.pages && book.pages.length > 0,
      count: book.pages?.length || 0,
      icon: Image,
      critical: true,
    },
  ];

  const missingCritical = components.filter(c => c.critical && !c.exists);
  const allComplete = missingCritical.length === 0;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                {allComplete ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                )}
                Book Diagnostics
                {!allComplete && (
                  <Badge variant="secondary" className="ml-2">
                    {missingCritical.length} missing
                  </Badge>
                )}
              </CardTitle>
              <Button variant="ghost" size="sm">
                {isOpen ? 'Hide' : 'Show'} Details
              </Button>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="space-y-2 pt-0">
            {components.map((component) => (
              <div
                key={component.name}
                className="flex items-center justify-between p-2 rounded border"
              >
                <div className="flex items-center gap-2">
                  <component.icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{component.name}</span>
                  {component.count !== undefined && (
                    <Badge variant="outline" className="ml-2">
                      {component.count} pages
                    </Badge>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  {component.exists ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      {component.url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(component.url, '_blank')}
                        >
                          View
                        </Button>
                      )}
                    </>
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                </div>
              </div>
            ))}
            
            <div className="mt-4 p-3 rounded bg-muted">
              <div className="text-sm">
                <strong>Status:</strong> {book.status}
              </div>
              {book.missing_components && book.missing_components.length > 0 && (
                <div className="text-sm mt-2">
                  <strong>Missing:</strong> {book.missing_components.join(', ')}
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};
