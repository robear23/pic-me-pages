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
        relative rounded-2xl p-6 cursor-pointer
        backdrop-blur-xl bg-background/40 border-2 transition-all duration-300
        hover:scale-105 hover:shadow-2xl
        ${isSelected 
          ? 'ring-2 ring-primary border-primary shadow-xl' 
          : 'border-border hover:border-primary/50'
        }
      `}
      whileHover={{ y: -5 }}
      whileTap={{ scale: 0.98 }}
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
      <div className="text-center mb-6 pt-2">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 mb-4">
          <Book className="w-10 h-10 text-primary" />
        </div>
        <h3 className="text-4xl font-bold mb-2">
          {pageCount}
        </h3>
        <p className="text-sm text-muted-foreground">
          Pages
        </p>
      </div>

      {/* Mockup Image Placeholder */}
      <div className="mb-6 rounded-lg overflow-hidden bg-muted/50 aspect-[4/3] flex items-center justify-center">
        <img
          src={`/examples/complexity-${pageCount === 12 ? 'simple' : pageCount === 24 ? 'medium' : 'detailed'}.png`}
          alt={`${pageCount}-page book preview`}
          className="w-full h-full object-cover"
          onError={(e) => {
            // Fallback if image doesn't exist
            e.currentTarget.style.display = 'none';
            e.currentTarget.parentElement!.innerHTML = `
              <div class="text-muted-foreground text-center">
                <Book class="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p class="text-sm">${pageCount} Pages</p>
              </div>
            `;
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
        <div className="mt-4 text-center">
          <p className="text-xs text-primary font-semibold">
            💰 Save $5 vs two 12-page books
          </p>
        </div>
      )}
      {pageCount === 32 && (
        <div className="mt-4 text-center">
          <p className="text-xs text-primary font-semibold">
            📚 33% more pages, only $10 more
          </p>
        </div>
      )}
    </motion.div>
  );
};
