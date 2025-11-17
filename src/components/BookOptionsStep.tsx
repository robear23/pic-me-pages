import { useState } from 'react';
import { motion } from 'framer-motion';
import { useBookStore } from '@/store/bookStore';
import { PageCountCard } from './PageCountCard';
import { PriceComparison } from './PriceComparison';
import { Button } from './ui/button';
import { ArrowLeft, ArrowRight } from 'lucide-react';
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

  const handlePageCountSelect = (pageCount: PageCount) => {
    setTempPageCount(pageCount);
  };

  const handleBindingSelect = (binding: BindingType) => {
    setTempBinding(binding);
  };

  const handleContinue = () => {
    setBookOptions(tempPageCount, tempBinding);
    setStep('generating');
  };

  const handleBack = () => {
    setStep('interests');
  };

  const pageCounts: PageCount[] = [12, 24, 32];

  return (
    <div className="min-h-screen w-full px-4 py-12 md:py-20">
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

        {/* Page Count Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {pageCounts.map((pageCount, index) => (
            <motion.div
              key={pageCount}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + index * 0.1 }}
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
          className="flex flex-col sm:flex-row gap-4 justify-center items-center"
        >
          <Button
            variant="ghost"
            size="lg"
            onClick={handleBack}
            className="w-full sm:w-auto"
          >
            <ArrowLeft className="mr-2 h-5 w-5" />
            Back to Interests
          </Button>
          <Button
            size="lg"
            onClick={handleContinue}
            className="w-full sm:w-auto bg-gradient-to-r from-primary via-purple-500 to-pink-500 hover:opacity-90 transition-opacity"
          >
            Continue to Generation
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
};
