import { motion } from 'framer-motion';
import { Book } from 'lucide-react';
import { BindingSelector } from './BindingSelector';
import type { PageCount, BindingType } from '@/types/bookOptions';
import { getOptionsForPageCount } from '@/types/bookOptions';

interface PageCountCardProps {
  pageCount: PageCount;
  isSelected: boolean;
  selectedBinding: BindingType;
  onSelect: (pageCount: PageCount) => void;
  onBindingSelect: (binding: BindingType) => void;
}

export const PageCountCard = ({
  pageCount,
  isSelected,
  selectedBinding,
  onSelect,
  onBindingSelect,
}: PageCountCardProps) => {
  const options = getOptionsForPageCount(pageCount);

  const handleCardClick = () => {
    onSelect(pageCount);
  };

  return (
    <motion.div
      onClick={handleCardClick}
      className={`
        relative rounded-2xl p-4 sm:p-6 cursor-pointer
        backdrop-blur-xl bg-background/40 border-2 transition-all duration-300
        hover:shadow-2xl
        ${isSelected 
          ? 'ring-2 ring-primary border-primary shadow-xl scale-105' 
          : 'border-border hover:border-primary/50'
        }
      `}
      whileHover={{ y: -5, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.98 }}
      role="button"
      aria-pressed={isSelected}
      aria-label={`Select ${pageCount} page book`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
    >
      {/* Page Count Header */}
      <div className="text-center mb-4 sm:mb-6 pt-2">
        <motion.div 
          className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 mb-3 sm:mb-4"
          whileHover={{ scale: 1.1, rotate: 5 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <Book className="w-8 h-8 sm:w-10 sm:h-10 text-primary" />
        </motion.div>
        <h3 className="text-3xl sm:text-4xl font-bold mb-1 sm:mb-2">
          {pageCount}
        </h3>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Pages
        </p>
      </div>

      {/* Binding Selector */}
      <BindingSelector
        pageCount={pageCount}
        selectedBinding={isSelected ? selectedBinding : 'premium'}
        onSelect={(binding) => {
          onSelect(pageCount);
          onBindingSelect(binding);
        }}
        options={options}
      />
    </motion.div>
  );
};
