import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useBookStore } from '@/store/bookStore';
import { 
  Download, 
  RefreshCw, 
  Check, 
  Loader2, 
  LayoutDashboard, 
  Plus,
  Sparkles,
  AlertCircle,
  Image as ImageIcon,
  ArrowLeft,
  ZoomIn
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { OrderPhysicalBookDialog } from './OrderPhysicalBookDialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PagePreviewModal } from './PagePreviewModal';

const MAX_COVER_CHANGES = 3;

export const BookPreviewStep = () => {
  const { 
    characters, 
    generatedPages, 
    selectedPagesForRework, 
    maxReworksReached,
    reworkedPageNumbers,
    selectedPageCount,
    togglePageForRework, 
    setStep, 
    reset, 
    generatedBookId, 
    paymentBypassed,
    setGeneratedPages,
    setReworkedPageNumbers
  } = useBookStore();

  const [isDownloading, setIsDownloading] = useState(false);
  const [retryingCover, setRetryingCover] = useState(false);
  const [bookData, setBookData] = useState<any>(null);
  const [coverRegenerationCount, setCoverRegenerationCount] = useState(0);
  const [selectedCoverPageIndex, setSelectedCoverPageIndex] = useState<number | null>(null);
  const [previewPageIndex, setPreviewPageIndex] = useState<number | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const characterNames = characters.map(c => c.name).filter(Boolean).join(' and ');

  // Use real generated pages, filter for those with images
  const pagesToShow = (generatedPages || []).filter(p => p != null && p.imageUrl);
  const hasRealPages = pagesToShow.length > 0;
  
  // Calculate max reworks allowed (50% of total pages)
  const maxAllowedReworks = Math.floor(selectedPageCount * 0.5);
  const remainingReworks = maxAllowedReworks - reworkedPageNumbers.length;
  const maxSelectableForRework = Math.min(remainingReworks, Math.floor(pagesToShow.length * 0.5));
  const coverChangesRemaining = MAX_COVER_CHANGES - coverRegenerationCount;

  useEffect(() => {
    // Load book data from database if we have a book ID
    const loadBookData = async () => {
      if (generatedBookId && user) {
        try {
          const { data: fetchedBook, error } = await supabase
            .from('books')
            .select('*')
            .eq('id', generatedBookId)
            .single();
          
          if (error) {
            console.error('Error loading book data:', error);
            return;
          }
          
          if (fetchedBook) {
            setBookData(fetchedBook);
            setCoverRegenerationCount(fetchedBook.cover_regeneration_count || 0);
            
            // Update pages if we got fresh data
            if (fetchedBook.pages) {
              const pages = (fetchedBook.pages as any[])
                .filter((p: any) => p != null && p.imageUrl)
                .map((p: any) => ({
                  pageNumber: p.pageNumber,
                  imageUrl: p.imageUrl,
                  prompt: p.prompt
                }));
              setGeneratedPages(pages);
            }
            
            // Update reworked page numbers
            if (fetchedBook.reworked_page_numbers) {
              setReworkedPageNumbers(fetchedBook.reworked_page_numbers);
            }
          }
        } catch (error) {
          console.error('Error loading book:', error);
        }
      }
    };
    
    loadBookData();
    
    // Trigger confetti on mount
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#a855f7', '#86efac'],
    });
  }, [generatedBookId, user]);

  const handleTogglePage = (pageNumber: number) => {
    const isSelected = selectedPagesForRework.includes(pageNumber);
    
    if (!isSelected && selectedPagesForRework.length >= maxSelectableForRework) {
      toast({
        title: 'Selection Limit Reached',
        description: `You can only select up to ${maxSelectableForRework} pages (${remainingReworks} reworks remaining).`,
        variant: 'destructive',
      });
      return;
    }
    
    if (!isSelected && reworkedPageNumbers.includes(pageNumber)) {
      toast({
        title: 'Page Already Reworked',
        description: 'This page has already been reworked.',
        variant: 'destructive',
      });
      return;
    }
    
    togglePageForRework(pageNumber);
  };

  const handleRegenerateSelected = async () => {
    // Handle cover change without rework
    if (selectedCoverPageIndex !== null && selectedPagesForRework.length === 0) {
      await handleCoverChange();
      return;
    }
    
    if (selectedPagesForRework.length === 0) {
      toast({
        title: 'No Pages Selected',
        description: 'Please select at least one page to rework.',
        variant: 'destructive',
      });
      return;
    }
    
    // Apply cover change before rework if selected
    if (selectedCoverPageIndex !== null) {
      await handleCoverChange();
    }
    
    // Enter rework mode and go to generating step
    useBookStore.setState({
      isReworkMode: true,
      currentStep: 'generating',
      generationProgress: 0,
      generationStatus: '',
      apiError: null,
    });
  };
  
  const handleCoverChange = async () => {
    if (selectedCoverPageIndex === null || !generatedBookId) return;
    
    const selectedPage = pagesToShow[selectedCoverPageIndex];
    if (!selectedPage) return;
    
    try {
      // Update the book's cover_image_url to use the selected page
      const { error } = await supabase
        .from('books')
        .update({ 
          cover_image_url: selectedPage.imageUrl,
          cover_regeneration_count: coverRegenerationCount + 1
        })
        .eq('id', generatedBookId);
      
      if (error) throw error;
      
      setCoverRegenerationCount(prev => prev + 1);
      setSelectedCoverPageIndex(null);
      
      // Reload book data
      const { data: updatedBook } = await supabase
        .from('books')
        .select('*')
        .eq('id', generatedBookId)
        .single();
      
      if (updatedBook) {
        setBookData(updatedBook);
      }
      
      toast({
        title: 'Cover Updated!',
        description: `Page ${selectedPage.pageNumber} is now your cover image.`,
      });
    } catch (error: any) {
      console.error('Cover change error:', error);
      toast({
        title: 'Cover Change Failed',
        description: error.message || 'Unable to change cover. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleRegenerateCover = async () => {
    if (!generatedBookId) return;
    if (coverChangesRemaining <= 0) {
      toast({
        title: 'Cover Change Limit Reached',
        description: `You've used all ${MAX_COVER_CHANGES} cover changes.`,
        variant: 'destructive',
      });
      return;
    }
    
    setRetryingCover(true);
    try {
      console.log('🎨 Regenerating cover...');
      
      const { data, error } = await supabase.functions.invoke('retry-book-cover', {
        body: { bookId: generatedBookId }
      });
      
      if (error) throw error;
      
      if (data.success) {
        // Increment cover regeneration count in DB
        await supabase
          .from('books')
          .update({ 
            cover_regeneration_count: coverRegenerationCount + 1 
          })
          .eq('id', generatedBookId);
        
        setCoverRegenerationCount(prev => prev + 1);
        
        toast({
          title: 'Cover Generated!',
          description: `New cover created. ${coverChangesRemaining - 1} changes remaining.`,
        });
        
        // Reload book data
        const { data: updatedBook } = await supabase
          .from('books')
          .select('*')
          .eq('id', generatedBookId)
          .single();
        
        if (updatedBook) {
          setBookData(updatedBook);
        }
      } else {
        throw new Error(data.error || 'Cover generation failed');
      }
    } catch (error: any) {
      console.error('Cover retry error:', error);
      toast({
        title: 'Cover Generation Failed',
        description: error.message || 'Unable to generate cover. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setRetryingCover(false);
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      if (bookData?.pdf_url) {
        const response = await fetch(bookData.pdf_url);
        if (response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${characterNames || 'Coloring-Book'}.pdf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          
          toast({
            title: 'PDF Downloaded!',
            description: 'Your coloring book has been downloaded',
          });
          setIsDownloading(false);
          return;
        }
      }
      
      // Fallback: Generate PDF client-side
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

      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pageWidth, pageHeight, 'F');
      
      pdf.setFontSize(32);
      pdf.setFont('helvetica', 'bold');
      const title = `${characterNames || 'My'}'s Coloring Book`;
      const titleWidth = pdf.getTextWidth(title);
      pdf.text(title, (pageWidth - titleWidth) / 2, 3);

      for (let i = 0; i < pagesToShow.length; i++) {
        const page = pagesToShow[i];
        if (!page.imageUrl) continue;
        
        pdf.addPage();
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
        } catch (imgError) {
          console.error(`Failed to add page ${page.pageNumber}:`, imgError);
        }
      }

      pdf.save(`${characterNames || 'Coloring-Book'}-${Date.now()}.pdf`);
      toast({
        title: 'PDF Downloaded!',
        description: `${pagesToShow.length} pages saved`,
      });
    } catch (error) {
      console.error('PDF generation error:', error);
      toast({
        title: 'Download Failed',
        description: 'Unable to generate PDF. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFinalize = () => {
    navigate('/dashboard');
  };

  const handleCreateNew = () => {
    reset();
    setStep('hero');
    navigate('/app');
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
          className="text-center mb-8"
        >
          {paymentBypassed && (
            <div className="mb-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 dark:bg-amber-950 border border-amber-500">
                <span className="text-amber-700 dark:text-amber-300 font-semibold">
                  🧪 Test Mode
                </span>
              </div>
            </div>
          )}
          <h2 className="font-black text-4xl md:text-5xl mb-4">
            Preview Your Book 📖
          </h2>
          <p className="text-lg text-muted-foreground">
            Select pages to rework, or click a page to use as your cover
          </p>
        </motion.div>

        {/* Info Bar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6 flex flex-wrap items-center justify-center gap-3"
        >
          <Badge variant="secondary" className="text-sm py-1.5 px-3">
            {selectedPagesForRework.length} page(s) selected
          </Badge>
          <Badge variant="outline" className="text-sm py-1.5 px-3">
            {remainingReworks} rework(s) remaining
          </Badge>
          <Badge variant="outline" className="text-sm py-1.5 px-3">
            {coverChangesRemaining} cover change(s) left
          </Badge>
        </motion.div>

        {/* Cover Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-8"
        >
          <Card className="overflow-hidden">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row items-center gap-6">
                {/* Cover Preview */}
                <div className="relative w-48 h-64 rounded-lg overflow-hidden border-2 border-primary/30 shadow-lg">
                  {bookData?.cover_image_url ? (
                    <img
                      src={bookData.cover_image_url}
                      alt="Book Cover"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <ImageIcon className="w-12 h-12 text-muted-foreground" />
                    </div>
                  )}
                </div>
                
                {/* Cover Actions */}
                <div className="flex-1 text-center md:text-left">
                  <h3 className="text-xl font-bold mb-2">Book Cover</h3>
                  <p className="text-muted-foreground mb-4">
                    {selectedCoverPageIndex !== null 
                      ? `Page ${pagesToShow[selectedCoverPageIndex]?.pageNumber} selected as new cover`
                      : coverChangesRemaining > 0 
                        ? `Click any page below to use as cover, or generate a new AI cover (${coverChangesRemaining} left).`
                        : 'You have used all cover changes.'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedCoverPageIndex !== null && (
                      <Button
                        onClick={() => setSelectedCoverPageIndex(null)}
                        variant="outline"
                        className="gap-2"
                      >
                        Clear Selection
                      </Button>
                    )}
                    <Button
                      onClick={handleRegenerateCover}
                      disabled={retryingCover || coverChangesRemaining <= 0}
                      variant="outline"
                      className="gap-2"
                    >
                      {retryingCover ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4" />
                          Generate AI Cover ({coverChangesRemaining} left)
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Rework Instructions */}
        {remainingReworks > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="mb-6"
          >
            <Alert>
              <Sparkles className="h-4 w-4" />
              <AlertDescription>
                <strong>Select pages to rework:</strong> Click on any page below to select it for regeneration. 
                You can select up to {maxSelectableForRework} pages.
              </AlertDescription>
            </Alert>
          </motion.div>
        )}

        {maxReworksReached && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-6"
          >
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                You've reached the maximum rework limit (50% of pages). No more reworks available.
              </AlertDescription>
            </Alert>
          </motion.div>
        )}

        {/* Pages Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8"
        >
          {pagesToShow.map((page, index) => {
            const isSelected = selectedPagesForRework.includes(page.pageNumber);
            const wasReworked = reworkedPageNumbers.includes(page.pageNumber);
            const canSelect = remainingReworks > 0 && !wasReworked;
            
            return (
              <motion.div
                key={page.pageNumber}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.05 * index }}
                className={`
                  group relative aspect-[3/4] rounded-lg overflow-hidden border-2 cursor-pointer bg-white
                  transition-all duration-200
                  ${selectedCoverPageIndex === index
                    ? 'border-amber-500 ring-2 ring-amber-500/50 shadow-lg scale-105'
                    : isSelected 
                      ? 'border-primary ring-2 ring-primary/50 shadow-lg scale-105' 
                      : wasReworked
                        ? 'border-green-500/50 opacity-75'
                        : canSelect
                          ? 'border-border hover:border-primary/50 hover:shadow-md'
                          : 'border-border opacity-50 cursor-not-allowed'
                  }
                `}
                onClick={() => setPreviewPageIndex(index)}
              >
                <img
                  src={page.imageUrl}
                  alt={`Page ${page.pageNumber}`}
                  className="w-full h-full object-contain bg-white"
                  loading="lazy"
                />
                
                {/* Page Number Badge */}
                <div className="absolute top-2 left-2 bg-background/80 backdrop-blur-sm px-2 py-0.5 rounded text-xs font-medium">
                  {page.pageNumber}
                </div>
                
                {/* Zoom Icon on Hover */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 flex items-center justify-center transition-colors">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 rounded-full p-2">
                    <ZoomIn className="w-5 h-5 text-foreground" />
                  </div>
                </div>
                
                {/* Selection Indicator */}
                {isSelected && (
                  <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                    <div className="bg-primary text-primary-foreground rounded-full p-2">
                      <Check className="w-6 h-6" />
                    </div>
                  </div>
                )}
                
                {/* Already Reworked Indicator */}
                {wasReworked && !isSelected && (
                  <div className="absolute bottom-2 right-2 bg-green-500 text-white rounded-full p-1">
                    <Check className="w-3 h-3" />
                  </div>
                )}
                
                {/* Cover Selection Indicator */}
                {selectedCoverPageIndex === index && (
                  <div className="absolute top-2 right-2 bg-amber-500 text-white rounded-full px-2 py-0.5 text-xs font-bold">
                    COVER
                  </div>
                )}
              </motion.div>
            );
          })}
        </motion.div>

        {/* Page Preview Modal */}
        <PagePreviewModal
          isOpen={previewPageIndex !== null}
          onClose={() => setPreviewPageIndex(null)}
          pages={pagesToShow}
          currentIndex={previewPageIndex ?? 0}
          onNavigate={setPreviewPageIndex}
          onSelectForRework={handleTogglePage}
          onUseAsCover={(index) => {
            setSelectedCoverPageIndex(index);
            toast({
              title: 'Cover Selected',
              description: `Page ${pagesToShow[index]?.pageNumber} will be used as the cover image.`,
            });
          }}
          selectedPagesForRework={selectedPagesForRework}
          reworkedPageNumbers={reworkedPageNumbers}
          selectedCoverPageIndex={selectedCoverPageIndex}
          canSelectForRework={remainingReworks > 0}
        />

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex flex-wrap items-center justify-center gap-4"
        >
          <Button
            onClick={() => setStep('complete')}
            size="lg"
            variant="ghost"
            className="gap-2"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Summary
          </Button>
          
          <Button
            onClick={handleRegenerateSelected}
            disabled={selectedPagesForRework.length === 0 && selectedCoverPageIndex === null}
            size="lg"
            className="gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
          >
            <RefreshCw className="w-5 h-5" />
            {selectedCoverPageIndex !== null && selectedPagesForRework.length > 0
              ? `Rework ${selectedPagesForRework.length} Page(s) & Change Cover`
              : selectedCoverPageIndex !== null
                ? 'Change Cover'
                : `Regenerate ${selectedPagesForRework.length} Page(s)`
            }
          </Button>
          
          <Button
            onClick={handleDownload}
            disabled={isDownloading}
            size="lg"
            variant="outline"
            className="gap-2"
          >
            {isDownloading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                Download PDF
              </>
            )}
          </Button>
          
          <OrderPhysicalBookDialog 
            bookId={generatedBookId || ''} 
            bookTitle={`${characterNames}'s Coloring Book`} 
          />
          
          <Button
            onClick={handleFinalize}
            size="lg"
            variant="secondary"
            className="gap-2"
          >
            <LayoutDashboard className="w-5 h-5" />
            Go to Dashboard
          </Button>
          
          <Button
            onClick={handleCreateNew}
            size="lg"
            variant="ghost"
            className="gap-2"
          >
            <Plus className="w-5 h-5" />
            Create New Book
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
};
