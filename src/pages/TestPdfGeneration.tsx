import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { repairBookPdf, generateCoverWrapPdf } from '@/lib/repairPdf';
import { validatePageCount, getBindingType } from '@/lib/luluConfig';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

const TestPdfGeneration = () => {
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<Array<{
    config: string;
    status: 'success' | 'error';
    message: string;
    pdfUrl?: string;
  }>>([]);

  // Generate a simple test image (white background with black text)
  const generateTestPage = (pageNumber: number): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 2550; // 8.5" at 300 DPI
    canvas.height = 3300; // 11" at 300 DPI
    
    const ctx = canvas.getContext('2d')!;
    
    // White background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Black border
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 10;
    ctx.strokeRect(50, 50, canvas.width - 100, canvas.height - 100);
    
    // Page number
    ctx.fillStyle = 'black';
    ctx.font = 'bold 200px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Page ${pageNumber}`, canvas.width / 2, canvas.height / 2);
    
    // Test pattern lines
    ctx.strokeStyle = 'lightgray';
    ctx.lineWidth = 2;
    for (let i = 200; i < canvas.height; i += 200) {
      ctx.beginPath();
      ctx.moveTo(100, i);
      ctx.lineTo(canvas.width - 100, i);
      ctx.stroke();
    }
    
    return canvas.toDataURL('image/png');
  };

  const generateTestCover = (title: string): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 2550; // 8.5" at 300 DPI
    canvas.height = 3300; // 11" at 300 DPI
    
    const ctx = canvas.getContext('2d')!;
    
    // Gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#667eea');
    gradient.addColorStop(1, '#764ba2');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Title
    ctx.fillStyle = 'white';
    ctx.font = 'bold 150px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, canvas.width / 2, canvas.height / 2);
    
    // Subtitle
    ctx.font = '80px Arial';
    ctx.fillText('Test Cover', canvas.width / 2, canvas.height / 2 + 200);
    
    return canvas.toDataURL('image/png');
  };

  const testConfiguration = async (
    pageCount: number,
    podPackageId: string,
    bindingName: string
  ) => {
    const config = `${pageCount} pages - ${bindingName}`;
    
    try {
      // Validate page count
      const bindingType = getBindingType(podPackageId);
      const validation = validatePageCount(pageCount, bindingType);
      
      if (!validation.valid) {
        console.log(`${config}: ${validation.message}`);
      }

      // Generate test pages
      const pages = Array.from({ length: pageCount }, (_, i) => ({
        imageUrl: generateTestPage(i + 1)
      }));

      // Generate interior PDF
      const testBookId = `test-${Date.now()}`;
      console.log(`Generating interior PDF for ${config}...`);
      
      const interiorUrl = await repairBookPdf(
        testBookId,
        pages,
        {
          pageCount,
          podPackageId,
          onProgress: (current, total) => {
            console.log(`${config}: ${current}/${total} pages processed`);
          }
        }
      );

      console.log(`✓ Interior PDF generated: ${interiorUrl}`);

      // Generate cover PDF
      const frontCover = generateTestCover('Front Cover');
      const backCover = generateTestCover('Back Cover');
      
      console.log(`Generating cover PDF for ${config}...`);
      const coverUrl = await generateCoverWrapPdf(
        testBookId,
        frontCover,
        backCover,
        podPackageId
      );

      console.log(`✓ Cover PDF generated: ${coverUrl}`);

      return {
        config,
        status: 'success' as const,
        message: validation.valid 
          ? `✓ Generated successfully (${validation.adjustedCount} pages)`
          : `✓ Generated with adjustment: ${validation.message}`,
        pdfUrl: interiorUrl
      };
    } catch (error: any) {
      console.error(`✗ Failed to generate ${config}:`, error);
      return {
        config,
        status: 'error' as const,
        message: `✗ Error: ${error.message}`
      };
    }
  };

  const runAllTests = async () => {
    setTesting(true);
    setResults([]);
    
    const testConfigs = [
      // Saddle Stitch (Standard) - must be divisible by 4
      { pageCount: 12, podPackageId: '0850X1100BWSTDSTD060UW444MXX', name: 'Saddle Stitch (B&W)' },
      { pageCount: 24, podPackageId: '0850X1100BWSTDSTD060UW444MXX', name: 'Saddle Stitch (B&W)' },
      { pageCount: 32, podPackageId: '0850X1100BWSTDSTD060UW444MXX', name: 'Saddle Stitch (B&W)' },
      
      // Coil Binding (Premium) - any count
      { pageCount: 12, podPackageId: '0850X1100FCPRECO060UW444MXX', name: 'Coil Binding (Color)' },
      { pageCount: 24, podPackageId: '0850X1100FCPRECO060UW444MXX', name: 'Coil Binding (Color)' },
      { pageCount: 32, podPackageId: '0850X1100FCPRECO060UW444MXX', name: 'Coil Binding (Color)' },
    ];

    const newResults = [];
    
    for (const config of testConfigs) {
      toast.info(`Testing ${config.pageCount} pages - ${config.name}...`);
      const result = await testConfiguration(
        config.pageCount,
        config.podPackageId,
        config.name
      );
      newResults.push(result);
      setResults([...newResults]);
      
      if (result.status === 'success') {
        toast.success(`${result.config}: Success`);
      } else {
        toast.error(`${result.config}: Failed`);
      }
      
      // Brief delay between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    setTesting(false);
    
    const successCount = newResults.filter(r => r.status === 'success').length;
    toast.success(`Tests complete: ${successCount}/${newResults.length} passed`);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">PDF Generation Testing</h1>
          <p className="text-muted-foreground">
            Test Lulu PDF specifications with different page counts and bindings
          </p>
        </div>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Test Configurations</h2>
          <div className="space-y-2 mb-6">
            <div className="text-sm">
              <strong>Saddle Stitch (B&W):</strong> 12, 24, 32 pages (must be divisible by 4)
            </div>
            <div className="text-sm">
              <strong>Coil Binding (Color):</strong> 12, 24, 32 pages (any count)
            </div>
            <div className="text-sm text-muted-foreground mt-4">
              Each test will generate interior and cover PDFs with proper:
            </div>
            <ul className="text-sm text-muted-foreground list-disc list-inside ml-4">
              <li>Dimensions: 8.75" x 11.25" (with 0.125" bleed)</li>
              <li>Safety margins: 0.5" from trim edge</li>
              <li>Gutter: 0.5" for coil binding</li>
              <li>Page count validation (divisible by 4 for saddle stitch)</li>
              <li>300 DPI resolution</li>
              <li>Grayscale for B&W, RGB for color</li>
              <li>Cover: 17.25" x 11.25" (no spine)</li>
            </ul>
          </div>

          <Button
            onClick={runAllTests}
            disabled={testing}
            size="lg"
            className="w-full"
          >
            {testing ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Running Tests...
              </>
            ) : (
              'Run All Tests'
            )}
          </Button>
        </Card>

        {results.length > 0 && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Test Results</h2>
            <div className="space-y-3">
              {results.map((result, index) => (
                <div
                  key={index}
                  className={`flex items-start gap-3 p-4 rounded-lg border ${
                    result.status === 'success'
                      ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800'
                      : 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800'
                  }`}
                >
                  {result.status === 'success' ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <div className="font-medium">{result.config}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {result.message}
                    </div>
                    {result.pdfUrl && (
                      <a
                        href={result.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline mt-2 inline-block"
                      >
                        View PDF →
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="text-center">
          <Button
            variant="outline"
            onClick={() => window.location.href = '/'}
          >
            Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TestPdfGeneration;
