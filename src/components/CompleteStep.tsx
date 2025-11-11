import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useBookStore } from '@/store/bookStore';
import { Download, ArrowLeft, ZoomIn, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const CompleteStep = () => {
  const { characterName, generatedPages, reset } = useBookStore();
  const [selectedImage, setSelectedImage] = useState<number | null>(null);

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

  const handleDownload = () => {
    // TODO: Implement PDF generation with jsPDF
    console.log('Downloading PDF...');
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
            {characterName}'s personalized coloring book with {pages.length} unique page{pages.length !== 1 ? 's' : ''}
          </p>
        </motion.div>

        {/* Partial failure warning */}
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
              <DialogTrigger asChild>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.3 + index * 0.05 }}
                  whileHover={{ scale: 1.05 }}
                  className="relative aspect-[8.5/11] rounded-xl overflow-hidden cursor-pointer group backdrop-blur-lg bg-glass-bg border border-glass-border"
                >
                  <img
                    src={page.imageUrl}
                    alt={`${characterName} - Page ${page.pageNumber}`}
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
              <DialogContent className="max-w-3xl">
                <DialogTitle className="sr-only">Page {page.pageNumber} Preview</DialogTitle>
                <DialogDescription className="sr-only">
                  Enlarged preview of {characterName}'s coloring page {page.pageNumber}
                </DialogDescription>
                <img
                  src={page.imageUrl}
                  alt={`${characterName} - Page ${page.pageNumber}`}
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
            className="bg-gradient-to-r from-secondary to-[hsl(170_70%_50%)] hover:scale-105 transition-transform duration-300 text-lg px-8"
          >
            <Download className="w-5 h-5 mr-2" />
            Download PDF
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
