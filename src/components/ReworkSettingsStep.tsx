import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useBookStore } from '@/store/bookStore';
import { RefreshCw, Sparkles } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const ReworkSettingsStep = () => {
  const { 
    consistentCharacters, 
    selectedPagesForRework,
    originalGenerationParams,
    generatedBookId,
    reworkedPageNumbers,
    selectedPageCount,
    toggleConsistentCharacters,
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
            Regenerating {selectedPagesForRework.length} page{selectedPagesForRework.length !== 1 ? 's' : ''}: {selectedPagesForRework.sort((a, b) => a - b).join(', ')}
            <br />
            <span className="text-sm">
              {reworkedPageNumbers.length} already reworked • {remainingAfterThis} reworks remaining after this
            </span>
          </p>

          <Alert className="mb-8 border-amber-500/30 bg-amber-500/5">
            <AlertDescription className="text-foreground">
              <strong>⚠️ Important:</strong> This will update your existing book, not create a new one. 
              The selected pages will be regenerated and replaced in your current book.
            </AlertDescription>
          </Alert>

          {originalGenerationParams && (
            <Alert className="mb-8 border-primary/30 bg-primary/5">
              <AlertDescription>
                <strong>Original settings:</strong> Photogenic illustrated style
                {originalGenerationParams.consistentCharacters ? ', with consistent characters' : ''}
              </AlertDescription>
            </Alert>
          )}

          <div className="mb-8 p-6 rounded-xl bg-primary/5 border border-primary/20">
            <div className="flex items-start gap-3">
              <Sparkles className="w-6 h-6 text-primary mt-1" />
              <div>
                <h3 className="text-lg font-bold mb-2">Photogenic Illustrated Style</h3>
                <p className="text-sm text-muted-foreground">
                  Your reworked pages will use the same high-quality photogenic illustrated style 
                  with soft, natural lighting and recognizable characters.
                </p>
              </div>
            </div>
          </div>

          <div className="mb-8 p-6 rounded-xl bg-input/20 border border-glass-border">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-lg font-bold mb-1">Consistent Character Appearance</h3>
                <p className="text-sm text-muted-foreground">
                  Keep characters looking the same across all pages
                </p>
              </div>
              <Switch
                checked={consistentCharacters}
                onCheckedChange={toggleConsistentCharacters}
                className="ml-4"
              />
            </div>
          </div>

          <Button
            onClick={() => setStep('generating')}
            size="lg"
            className="w-full bg-gradient-to-r from-primary to-[hsl(330_80%_60%)] hover:scale-105 transition-transform duration-300"
          >
            <RefreshCw className="w-5 h-5 mr-2" />
            Generate Reworks
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
};
