import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useBookStore } from '@/store/bookStore';
import { Download, ArrowLeft, ZoomIn, AlertCircle, Check, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const CompleteStep = () => {
  const { characters, generatedPages, selectedPagesForRework, maxReworksReached, togglePageForRework, enterReworkMode, setStep, reset } = useBookStore();
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  
  const characterNames = characters.map(c => c.name).filter(Boolean).join(' and ');

  // Use real generated pages, filter for those with images
  const pagesToShow = (generatedPages || []).filter(p => !!p.imageUrl);
  const hasRealPages = pagesToShow.length > 0;
  
  // Mock pages as fallback
  const mockPages = Array.from({ length: 12 }, (_, i) => ({
    pageNumber: i + 1,
    imageUrl: `https://via.placeholder.com/400x500/1a1a2e/ffffff?text=Page+${i + 1}`,
    prompt: `Coloring page ${i + 1}`,
  }));
  
  const pages = hasRealPages ? pagesToShow : mockPages;
  const failedCount = (generatedPages || []).length - pagesToShow.length;
  const maxSelectable = Math.floor(pages.length * 0.5);

  const handleStartRework = () => {
    enterReworkMode();
    setStep('rework-settings');
  };

  useEffect(() => {
    // Trigger confetti
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#a855f7', '#86efac'],
    });
    
    // Development diagnostics
    console.log('CompleteStep mounted:', {
      totalPages: generatedPages?.length || 0,
      pagesWithImages: pagesToShow.length,
      hasRealPages,
      sampleImagePrefix: pagesToShow[0]?.imageUrl?.substring(0, 50)
    });
  }, []);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      console.log('Downloading PDF...');
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'in',
        format: 'letter'
      });

      const pageWidth = 8.5;
      const pageHeight = 11;
      const margin = 0.5;
      const imageWidth = pageWidth - (margin * 2);
      const imageHeight = pageHeight - (margin * 2);

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        
        if (!page.imageUrl) continue;
        
        if (i > 0) {
          pdf.addPage();
        }

        try {
          pdf.addImage(
            page.imageUrl,
            'PNG',
            margin,
            margin,
            imageWidth,
            imageHeight,
            undefined,
            'FAST'
          );

          pdf.setFontSize(10);
          pdf.setTextColor(100);
          pdf.text(
            `Page ${page.pageNumber}`,
            pageWidth / 2,
            pageHeight - 0.25,
            { align: 'center' }
          );
        } catch (imgError) {
          console.error(`Failed to add page ${page.pageNumber}:`, imgError);
        }
      }

      const filename = `${characterNames || 'Coloring-Book'}-${Date.now()}.pdf`;
      pdf.save(filename);

      const { toast } = await import('@/hooks/use-toast');
      toast({
        title: 'PDF Downloaded!',
        description: `${pages.length} pages saved as ${filename}`,
      });
    } catch (error) {
      console.error('PDF generation error:', error);
      const { toast } = await import('@/hooks/use-toast');
      toast({
        title: 'Download Failed',
        description: 'Unable to generate PDF. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen px-6 pt-24 pb-12"
    >
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-center mb-12"
        >
          <h2 className="font-black text-5xl md:text-6xl mb-4">
            Your Book is Ready! 🎉
          </h2>
          <p className="text-xl text-muted-foreground">
            {characterNames ? `${characterNames}'s` : 'Your'} personalized coloring book with {pages.length} unique page{pages.length !== 1 ? 's' : ''}
          </p>
        </motion.div>

          {/* Action Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="flex flex-wrap gap-4 mb-8 justify-center"
          >
            {!maxReworksReached && !selectionMode && (
              <Button
                onClick={() => setSelectionMode(true)}
                variant="outline"
                size="lg"
              >
                Select Pages to Rework
              </Button>
            )}
            
            {selectionMode && (
              <>
                <Button
                  onClick={() => {
                    setSelectionMode(false);
                    useBookStore.setState({ selectedPagesForRework: [] });
                  }}
                  variant="outline"
                  size="lg"
                >
                  Cancel Selection
                </Button>
                <Button
                  onClick={handleStartRework}
                  disabled={selectedPagesForRework.length === 0}
                  size="lg"
                  className="bg-gradient-to-r from-primary to-[hsl(330_80%_60%)]"
                >
                  Rework {selectedPagesForRework.length} Page{selectedPagesForRework.length !== 1 ? 's' : ''}
                </Button>
              </>
            )}
            
            <Button onClick={handleDownload} size="lg" disabled={isDownloading}>
              {isDownloading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Generating PDF...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5 mr-2" />
                  Download PDF
                </>
              )}
            </Button>
          </motion.div>
          
          {selectionMode && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center mb-6"
            >
              <p className="text-sm text-muted-foreground">
                {selectedPagesForRework.length} of {maxSelectable} pages selected (max {maxSelectable})
              </p>
            </motion.div>
          )}
          
          {maxReworksReached && (
            <Alert className="mb-8 border-secondary/30 bg-secondary/5">
              <AlertCircle className="h-4 w-4 text-secondary" />
              <AlertDescription>
                Rework completed! No further changes allowed. Download your final book.
              </AlertDescription>
            </Alert>
          )}
        {failedCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="mb-8"
          >
            <Alert variant="default" className="border-yellow-500/50 bg-yellow-500/10">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              <AlertDescription className="text-yellow-200">
                {failedCount} page{failedCount !== 1 ? 's' : ''} failed to generate. Showing {pages.length} successful page{pages.length !== 1 ? 's' : ''}.
              </AlertDescription>
            </Alert>
          </motion.div>
        )}

        {/* Gallery Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-12"
        >
          {pages.map((page, index) => (
            <Dialog key={page.pageNumber}>
              <div className="relative">
                {selectionMode && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePageForRework(page.pageNumber);
                    }}
                    className="absolute top-2 left-2 z-10 cursor-pointer"
                  >
                    <div
                      className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${
                        selectedPagesForRework.includes(page.pageNumber)
                          ? 'bg-primary border-primary'
                          : 'bg-background border-border hover:border-primary'
                      } ${
                        !selectedPagesForRework.includes(page.pageNumber) &&
                        selectedPagesForRework.length >= maxSelectable
                          ? 'opacity-50 cursor-not-allowed'
                          : ''
                      }`}
                    >
                      {selectedPagesForRework.includes(page.pageNumber) && (
                        <Check className="w-4 h-4 text-primary-foreground" />
                      )}
                    </div>
                  </div>
                )}
                <DialogTrigger asChild disabled={selectionMode}>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.3 + index * 0.05 }}
                    whileHover={{ scale: 1.05 }}
                    className="relative aspect-[8.5/11] rounded-xl overflow-hidden cursor-pointer group backdrop-blur-lg bg-glass-bg border border-glass-border"
                  >
                    <img
                      src={page.imageUrl}
                      alt={`${characterNames || 'Coloring book'} - Page ${page.pageNumber}`}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                      <ZoomIn className="w-8 h-8 text-white" />
                    </div>
                    <div className="absolute bottom-2 right-2 bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs font-bold">
                      Page {page.pageNumber}
                    </div>
                  </motion.div>
                </DialogTrigger>
              </div>
              <DialogContent className="max-w-3xl">
                <DialogTitle className="sr-only">Page {page.pageNumber} Preview</DialogTitle>
                <DialogDescription className="sr-only">
                  Enlarged preview of {characterNames || 'coloring book'} page {page.pageNumber}
                </DialogDescription>
                <img
                  src={page.imageUrl}
                  alt={`${characterNames || 'Coloring book'} - Page ${page.pageNumber}`}
                  className="w-full h-auto"
                />
              </DialogContent>
            </Dialog>
          ))}
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="flex flex-col md:flex-row gap-4 justify-center"
        >
          <Button
            onClick={handleDownload}
            size="lg"
            disabled={isDownloading}
            className="bg-gradient-to-r from-secondary to-[hsl(170_70%_50%)] hover:scale-105 transition-transform duration-300 text-lg px-8"
          >
            {isDownloading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Generating PDF...
              </>
            ) : (
              <>
                <Download className="w-5 h-5 mr-2" />
                Download PDF
              </>
            )}
          </Button>
          <Button
            onClick={reset}
            size="lg"
            variant="outline"
            className="border-glass-border hover:bg-glass-bg hover:scale-105 transition-transform duration-300 text-lg px-8"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Create Another Book
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
};
