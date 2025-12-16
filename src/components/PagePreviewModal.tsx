import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, RefreshCw, Image as ImageIcon, X } from 'lucide-react';

interface PagePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  pages: Array<{ pageNumber: number; imageUrl: string; prompt?: string }>;
  currentIndex: number;
  onNavigate: (index: number) => void;
  onSelectForRework: (pageNumber: number) => void;
  onUseAsCover: (index: number) => void;
  selectedPagesForRework: number[];
  reworkedPageNumbers: number[];
  selectedCoverPageIndex: number | null;
  canSelectForRework: boolean;
}

export const PagePreviewModal = ({
  isOpen,
  onClose,
  pages,
  currentIndex,
  onNavigate,
  onSelectForRework,
  onUseAsCover,
  selectedPagesForRework,
  reworkedPageNumbers,
  selectedCoverPageIndex,
  canSelectForRework,
}: PagePreviewModalProps) => {
  const currentPage = pages[currentIndex];
  
  if (!currentPage) return null;

  const isSelectedForRework = selectedPagesForRework.includes(currentPage.pageNumber);
  const wasReworked = reworkedPageNumbers.includes(currentPage.pageNumber);
  const isCoverSelected = selectedCoverPageIndex === currentIndex;
  
  const handlePrevious = () => {
    if (currentIndex > 0) {
      onNavigate(currentIndex - 1);
    }
  };
  
  const handleNext = () => {
    if (currentIndex < pages.length - 1) {
      onNavigate(currentIndex + 1);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') handlePrevious();
    if (e.key === 'ArrowRight') handleNext();
    if (e.key === 'Escape') onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-5xl max-h-[90vh] p-0 overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader className="p-4 pb-0 flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <DialogTitle>Page {currentPage.pageNumber}</DialogTitle>
            <Badge variant="outline" className="text-xs">
              {currentIndex + 1} of {pages.length}
            </Badge>
            {isSelectedForRework && (
              <Badge variant="default" className="text-xs">Selected for Rework</Badge>
            )}
            {wasReworked && !isSelectedForRework && (
              <Badge variant="secondary" className="text-xs bg-green-500/20 text-green-700">Already Reworked</Badge>
            )}
            {isCoverSelected && (
              <Badge variant="secondary" className="text-xs bg-amber-500/20 text-amber-700">Cover Selected</Badge>
            )}
          </div>
        </DialogHeader>
        
        <div className="relative flex-1 flex items-center justify-center p-4 bg-muted/30">
          {/* Navigation Arrows */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-2 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-background/80 hover:bg-background shadow-lg z-10"
            onClick={handlePrevious}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-background/80 hover:bg-background shadow-lg z-10"
            onClick={handleNext}
            disabled={currentIndex === pages.length - 1}
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
          
          {/* Image */}
          <div className="max-h-[60vh] flex items-center justify-center">
            <img
              src={currentPage.imageUrl}
              alt={`Page ${currentPage.pageNumber}`}
              className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-lg bg-white"
            />
          </div>
        </div>
        
        {/* Prompt Info */}
        {currentPage.prompt && (
          <div className="px-4 py-2 bg-muted/50 border-t">
            <p className="text-sm text-muted-foreground line-clamp-2">
              <span className="font-medium">Prompt:</span> {currentPage.prompt}
            </p>
          </div>
        )}
        
        {/* Actions */}
        <div className="p-4 border-t flex flex-wrap items-center justify-center gap-3">
          <Button
            onClick={() => onSelectForRework(currentPage.pageNumber)}
            variant={isSelectedForRework ? "default" : "outline"}
            disabled={!canSelectForRework && !isSelectedForRework || wasReworked}
            className="gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            {isSelectedForRework ? 'Selected for Rework' : wasReworked ? 'Already Reworked' : 'Select for Rework'}
          </Button>
          
          <Button
            onClick={() => onUseAsCover(currentIndex)}
            variant={isCoverSelected ? "default" : "outline"}
            className="gap-2"
            disabled={isSelectedForRework}
          >
            <ImageIcon className="w-4 h-4" />
            {isCoverSelected ? 'Cover Selected' : 'Use as Cover'}
          </Button>
          
          <Button
            onClick={onClose}
            variant="ghost"
            className="gap-2"
          >
            <X className="w-4 h-4" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
