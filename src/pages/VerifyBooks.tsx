import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { validatePdfDimensions, generateValidationReport } from "@/lib/pdfValidator";
import { getBindingType } from "@/lib/luluConfig";
import { Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

interface BookValidation {
  bookId: string;
  characterName: string;
  pageCount: number;
  bindingType: string;
  podPackageId: string;
  interiorResult?: any;
  coverResult?: any;
  status: 'pending' | 'validating' | 'complete' | 'error';
  error?: string;
}

export default function VerifyBooks() {
  const [validations, setValidations] = useState<BookValidation[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const { toast } = useToast();

  const runValidation = async () => {
    setIsValidating(true);
    setValidations([]);

    try {
      // Fetch books with PDFs
      const { data: books, error } = await supabase
        .from('books')
        .select('id, character_name, pdf_url, cover_url, selected_page_count, selected_pod_package_id, selected_binding_type')
        .not('pdf_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      if (!books || books.length === 0) {
        toast({
          title: "No books found",
          description: "No books with PDFs found to validate",
        });
        setIsValidating(false);
        return;
      }

      // Initialize validation states
      const initialValidations: BookValidation[] = books.map(book => ({
        bookId: book.id,
        characterName: book.character_name,
        pageCount: book.selected_page_count || 12,
        bindingType: book.selected_binding_type || 'standard',
        podPackageId: book.selected_pod_package_id || '',
        status: 'pending' as const,
      }));

      setValidations(initialValidations);

      // Validate each book
      for (let i = 0; i < books.length; i++) {
        const book = books[i];
        
        setValidations(prev => prev.map((v, idx) => 
          idx === i ? { ...v, status: 'validating' as const } : v
        ));

        try {
          // Validate interior PDF
          let interiorResult;
          if (book.pdf_url) {
            interiorResult = await validatePdfDimensions(book.pdf_url, 'interior');
          }

          // Validate cover PDF
          let coverResult;
          if (book.cover_url) {
            coverResult = await validatePdfDimensions(book.cover_url, 'cover');
          }

          setValidations(prev => prev.map((v, idx) => 
            idx === i ? { 
              ...v, 
              interiorResult,
              coverResult,
              status: 'complete' as const 
            } : v
          ));

        } catch (err: any) {
          console.error(`Error validating book ${book.id}:`, err);
          setValidations(prev => prev.map((v, idx) => 
            idx === i ? { 
              ...v, 
              status: 'error' as const,
              error: err.message || 'Validation failed'
            } : v
          ));
        }
      }

      toast({
        title: "Validation complete",
        description: `Validated ${books.length} books`,
      });

    } catch (error: any) {
      console.error('Error running validation:', error);
      toast({
        title: "Validation failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsValidating(false);
    }
  };

  const getStatusIcon = (validation: BookValidation) => {
    if (validation.status === 'validating') return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    if (validation.status === 'error') return <XCircle className="h-5 w-5 text-destructive" />;
    
    const hasIssues = 
      !validation.interiorResult?.valid || 
      !validation.coverResult?.valid ||
      validation.interiorResult?.errors?.length > 0 ||
      validation.coverResult?.errors?.length > 0;
    
    if (hasIssues) return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    return <CheckCircle2 className="h-5 w-5 text-green-500" />;
  };

  const getBindingLabel = (bindingType: string) => {
    return bindingType === 'standard' ? 'Saddle Stitch' : 'Coil Binding';
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Verify Book PDFs</h1>
        <p className="text-muted-foreground">
          Check your existing books against Lulu specifications
        </p>
      </div>

      <div className="mb-6">
        <Button 
          onClick={runValidation} 
          disabled={isValidating}
          size="lg"
        >
          {isValidating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Validating...
            </>
          ) : (
            'Run Validation'
          )}
        </Button>
      </div>

      {validations.length > 0 && (
        <div className="space-y-4">
          {validations.map((validation, idx) => (
            <Card key={validation.bookId} className="p-6">
              <div className="flex items-start gap-4">
                <div className="mt-1">
                  {getStatusIcon(validation)}
                </div>
                
                <div className="flex-1 space-y-3">
                  <div>
                    <h3 className="text-xl font-semibold mb-1">
                      Book {idx + 1}: {validation.characterName}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {validation.pageCount} pages • {getBindingLabel(validation.bindingType)}
                    </p>
                  </div>

                  {validation.status === 'error' && (
                    <div className="p-3 bg-destructive/10 rounded-md">
                      <p className="text-sm text-destructive">{validation.error}</p>
                    </div>
                  )}

                  {validation.interiorResult && (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">Interior PDF</h4>
                      <div className="pl-4 space-y-1 text-sm">
                        <p className={validation.interiorResult.valid ? "text-green-600" : "text-yellow-600"}>
                          Status: {validation.interiorResult.valid ? '✓ Valid' : '⚠ Has warnings'}
                        </p>
                        <p className="text-muted-foreground">
                          Dimensions: {validation.interiorResult.actualDimensions?.width?.toFixed(2)}" × {validation.interiorResult.actualDimensions?.height?.toFixed(2)}"
                        </p>
                        <p className="text-muted-foreground">
                          Expected: {validation.interiorResult.expectedDimensions?.width?.toFixed(2)}" × {validation.interiorResult.expectedDimensions?.height?.toFixed(2)}"
                        </p>
                        
                        {validation.interiorResult.errors?.length > 0 && (
                          <div className="mt-2 p-2 bg-destructive/10 rounded">
                            <p className="font-semibold text-destructive">Errors:</p>
                            {validation.interiorResult.errors.map((err: string, i: number) => (
                              <p key={i} className="text-sm text-destructive">• {err}</p>
                            ))}
                          </div>
                        )}
                        
                        {validation.interiorResult.warnings?.length > 0 && (
                          <div className="mt-2 p-2 bg-yellow-500/10 rounded">
                            <p className="font-semibold text-yellow-600">Warnings:</p>
                            {validation.interiorResult.warnings.map((warn: string, i: number) => (
                              <p key={i} className="text-sm text-yellow-600">• {warn}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {validation.coverResult && (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">Cover PDF</h4>
                      <div className="pl-4 space-y-1 text-sm">
                        <p className={validation.coverResult.valid ? "text-green-600" : "text-yellow-600"}>
                          Status: {validation.coverResult.valid ? '✓ Valid' : '⚠ Has warnings'}
                        </p>
                        <p className="text-muted-foreground">
                          Dimensions: {validation.coverResult.actualDimensions?.width?.toFixed(2)}" × {validation.coverResult.actualDimensions?.height?.toFixed(2)}"
                        </p>
                        <p className="text-muted-foreground">
                          Expected: {validation.coverResult.expectedDimensions?.width?.toFixed(2)}" × {validation.coverResult.expectedDimensions?.height?.toFixed(2)}"
                        </p>
                        
                        {validation.coverResult.errors?.length > 0 && (
                          <div className="mt-2 p-2 bg-destructive/10 rounded">
                            <p className="font-semibold text-destructive">Errors:</p>
                            {validation.coverResult.errors.map((err: string, i: number) => (
                              <p key={i} className="text-sm text-destructive">• {err}</p>
                            ))}
                          </div>
                        )}
                        
                        {validation.coverResult.warnings?.length > 0 && (
                          <div className="mt-2 p-2 bg-yellow-500/10 rounded">
                            <p className="font-semibold text-yellow-600">Warnings:</p>
                            {validation.coverResult.warnings.map((warn: string, i: number) => (
                              <p key={i} className="text-sm text-yellow-600">• {warn}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
