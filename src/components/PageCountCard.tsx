import { motion } from 'framer-motion';
import { Book, Star, TrendingUp } from 'lucide-react';
import { Badge } from './ui/badge';
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
  const standardOption = options[0];
  const premiumOption = options[1];

  const getBadge = () => {
    if (pageCount === 24) return { text: 'BEST VALUE', icon: Star };
    if (pageCount === 12) return { text: 'RECOMMENDED', icon: TrendingUp };
    return null;
  };

  const badge = getBadge();

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
      {/* Badge */}
      {badge && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10">
          <Badge className="bg-gradient-to-r from-primary via-purple-500 to-pink-500 text-white px-3 py-1 text-xs font-bold shadow-lg">
            <badge.icon className="w-3 h-3 mr-1 inline-block" />
            {badge.text}
          </Badge>
        </div>
      )}

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

      {/* Mockup Image Placeholder */}
      <div className="mb-4 sm:mb-6 rounded-lg overflow-hidden bg-muted/50 aspect-[4/3] flex items-center justify-center">
        <img
          src={`/examples/complexity-${pageCount === 12 ? 'simple' : pageCount === 24 ? 'medium' : 'detailed'}.png`}
          alt={`${pageCount}-page book preview`}
          className="w-full h-full object-cover transition-opacity duration-300"
          loading="lazy"
          onError={(e) => {
            // Fallback if image doesn't exist
            e.currentTarget.style.display = 'none';
            const parent = e.currentTarget.parentElement;
            if (parent) {
              parent.innerHTML = `
                <div class="text-muted-foreground text-center p-4">
                  <svg class="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                  </svg>
                  <p class="text-xs sm:text-sm">${pageCount} Pages</p>
                </div>
              `;
            }
          }}
        />
      </div>

      {/* Binding Selector */}
      <BindingSelector
        pageCount={pageCount}
        selectedBinding={isSelected ? selectedBinding : 'premium'}
        onSelect={(binding) => {
          onSelect(pageCount);
          onBindingSelect(binding);
        }}
        standardOption={standardOption}
        premiumOption={premiumOption}
      />

      {/* Value Messaging */}
      {pageCount === 24 && (
        <motion.div 
          className="mt-3 sm:mt-4 text-center"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <p className="text-xs sm:text-sm text-primary font-semibold">
            💰 Save $5 vs two 12-page books
          </p>
        </motion.div>
      )}
      {pageCount === 32 && (
        <motion.div 
          className="mt-3 sm:mt-4 text-center"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <p className="text-xs sm:text-sm text-primary font-semibold">
            📚 33% more pages, only $10 more
          </p>
        </motion.div>
      )}
    </motion.div>
  );
};
