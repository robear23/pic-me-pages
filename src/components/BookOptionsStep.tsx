import { useState } from 'react';
import { motion } from 'framer-motion';
import { useBookStore } from '@/store/bookStore';
import { PageCountCard } from './PageCountCard';
import { PriceComparison } from './PriceComparison';
import { Button } from './ui/button';
import { ArrowLeft, ArrowRight, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { useToast } from '@/hooks/use-toast';
import type { PageCount, BindingType } from '@/types/bookOptions';

export const BookOptionsStep = () => {
  const { 
    selectedPageCount, 
    selectedBinding,
    setBookOptions,
    setStep 
  } = useBookStore();

  const [tempPageCount, setTempPageCount] = useState<PageCount>(selectedPageCount);
  const [tempBinding, setTempBinding] = useState<BindingType>(selectedBinding);
  const [error, setError] = useState<string>('');
  const { toast } = useToast();

  const handlePageCountSelect = (pageCount: PageCount) => {
    setTempPageCount(pageCount);
    setError(''); // Clear error on selection
  };

  const handleBindingSelect = (binding: BindingType) => {
    setTempBinding(binding);
    setError(''); // Clear error on selection
  };

  const handleContinue = () => {
    // Validation
    if (!tempPageCount) {
      setError('Please select a page count');
      toast({
        title: 'Selection Required',
        description: 'Please select a page count and binding type',
        variant: 'destructive',
      });
      return;
    }

    if (!tempBinding) {
      setError('Please select a binding type');
      toast({
        title: 'Selection Required',
        description: 'Please select a binding type',
        variant: 'destructive',
      });
      return;
    }

      try {
        setBookOptions(tempPageCount, tempBinding);
        setStep('payment');
      } catch (err) {
      setError('Failed to save book options. Please try again.');
      toast({
        title: 'Error',
        description: 'Failed to save book options',
        variant: 'destructive',
      });
    }
  };

  const handleBack = () => {
    setStep('interests');
  };

  const pageCounts: PageCount[] = [12];

  return (
    <div className="min-h-screen w-full px-4 py-8 md:py-12 lg:py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-7xl mx-auto"
      >
        {/* Header */}
        <div className="text-center mb-12">
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent"
          >
            Choose Your Book Options
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-lg text-muted-foreground max-w-2xl mx-auto"
          >
            Select the perfect size and binding for your personalized coloring book
          </motion.p>
        </div>

        {/* Error Alert */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </motion.div>
        )}

        {/* Page Count Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-8">
          {pageCounts.map((pageCount, index) => (
            <motion.div
              key={pageCount}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ 
                delay: 0.4 + index * 0.15,
                type: "spring",
                stiffness: 100,
                damping: 15
              }}
            >
              <PageCountCard
                pageCount={pageCount}
                isSelected={tempPageCount === pageCount}
                selectedBinding={tempPageCount === pageCount ? tempBinding : 'premium'}
                onSelect={handlePageCountSelect}
                onBindingSelect={handleBindingSelect}
              />
            </motion.div>
          ))}
        </div>

        {/* Price Comparison (Optional) */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mb-12"
        >
          <PriceComparison />
        </motion.div>

        {/* Navigation Buttons */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center items-center"
        >
          <Button
            variant="ghost"
            size="lg"
            onClick={handleBack}
            className="w-full sm:w-auto order-2 sm:order-1"
            aria-label="Go back to interests step"
          >
            <ArrowLeft className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
            Back to Interests
          </Button>
          <Button
            size="lg"
            onClick={handleContinue}
            disabled={!tempPageCount || !tempBinding}
            className="w-full sm:w-auto order-1 sm:order-2 bg-gradient-to-r from-primary via-purple-500 to-pink-500 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Continue to book generation"
          >
            Continue to Generation
            <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
};
