import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useBookStore } from '@/store/bookStore';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const ReworkSettingsStep = () => {
  const { 
    consistentCharacters, 
    selectedPagesForRework,
    generatedBookId,
    reworkedPageNumbers,
    selectedPageCount,
    setStep,
  } = useBookStore();
  
  const maxAllowedReworks = Math.floor(selectedPageCount * 0.5);
  const remainingAfterThis = maxAllowedReworks - (reworkedPageNumbers.length + selectedPagesForRework.length);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen flex items-center justify-center px-6 pt-24 pb-12"
    >
      <div className="max-w-3xl w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="backdrop-blur-lg bg-glass-bg border border-glass-border rounded-2xl p-8 md:p-12"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <RefreshCw className="w-8 h-8 text-primary" />
            <h2 className="font-black text-4xl md:text-5xl text-center">
              Rework Selected Pages
            </h2>
          </div>
          
          <p className="text-lg text-muted-foreground text-center mb-8">
            {selectedPagesForRework.length > 0 ? (
              <>
                Regenerating {selectedPagesForRework.length} page{selectedPagesForRework.length !== 1 ? 's' : ''}: {selectedPagesForRework.sort((a, b) => a - b).join(', ')}
                <br />
                <span className="text-sm">
                  {reworkedPageNumbers.length} already reworked • {remainingAfterThis} reworks remaining after this
                </span>
              </>
            ) : (
              <span className="text-destructive font-semibold">
                ⚠️ No pages selected for rework!
              </span>
            )}
          </p>

          {selectedPagesForRework.length === 0 && (
            <Alert className="mb-8 border-destructive/30 bg-destructive/5">
              <AlertDescription className="text-foreground">
                <strong>⚠️ Error:</strong> You must select at least one page to rework. Please go back and select pages from your book.
              </AlertDescription>
            </Alert>
          )}

          <Alert className="mb-8 border-amber-500/30 bg-amber-500/5">
            <AlertDescription className="text-foreground">
              <strong>⚠️ Important:</strong> This will update your existing book, not create a new one. 
              The selected pages will be regenerated and replaced. <strong>Covers will NOT be changed.</strong>
            </AlertDescription>
          </Alert>

          <Button
            onClick={() => setStep('generating')}
            size="lg"
            className="w-full bg-gradient-to-r from-primary to-[hsl(330_80%_60%)] hover:scale-105 transition-transform duration-300"
            disabled={selectedPagesForRework.length === 0}
          >
            <RefreshCw className="w-5 h-5 mr-2" />
            {selectedPagesForRework.length > 0 
              ? `Generate ${selectedPagesForRework.length} Rework${selectedPagesForRework.length !== 1 ? 's' : ''}`
              : 'No Pages Selected'}
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
};
