import { motion } from 'framer-motion';
import { Layers, Circle, Check } from 'lucide-react';
import type { PageCount, BindingType, BookOption } from '@/types/bookOptions';

interface BindingSelectorProps {
  pageCount: PageCount;
  selectedBinding: BindingType;
  onSelect: (binding: BindingType) => void;
  standardOption: BookOption;
  premiumOption: BookOption;
}

export const BindingSelector = ({
  selectedBinding,
  onSelect,
  standardOption,
  premiumOption,
}: BindingSelectorProps) => {
  const options = [
    { type: 'standard' as BindingType, option: standardOption, icon: Layers },
    { type: 'premium' as BindingType, option: premiumOption, icon: Circle },
  ];

  return (
    <div className="space-y-2 sm:space-y-3">
      {options.map(({ type, option, icon: Icon }) => {
        const isSelected = selectedBinding === type;

        return (
          <motion.button
            key={type}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(type);
            }}
            className={`
              w-full text-left p-3 sm:p-4 rounded-xl border-2 transition-all duration-300
              ${isSelected 
                ? 'border-primary bg-primary/10 shadow-lg' 
                : 'border-border hover:border-primary/50 hover:bg-accent/50'
              }
            `}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            role="radio"
            aria-checked={isSelected}
            aria-label={`Select ${type} binding - $${option.price.toFixed(2)}`}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onSelect(type);
              }
            }}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                <div className={`
                  p-1.5 sm:p-2 rounded-lg transition-colors flex-shrink-0
                  ${isSelected 
                    ? 'bg-primary/20 text-primary' 
                    : 'bg-muted text-muted-foreground'
                  }
                `}>
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-semibold text-xs sm:text-sm flex items-center gap-1 sm:gap-2">
                    <span className="truncate">{type === 'standard' ? 'Standard' : 'Premium Coil'}</span>
                    {isSelected && <Check className="w-3 h-3 sm:w-4 sm:h-4 text-primary flex-shrink-0" />}
                  </h4>
                  <p className="text-xs text-muted-foreground hidden sm:block">
                    {type === 'standard' ? 'Saddle Stitch' : 'Lays Flat'}
                  </p>
                </div>
              </div>
              <div className="text-right flex-shrink-0 ml-2">
                <p className="text-base sm:text-lg font-bold text-primary whitespace-nowrap">
                  ${option.price.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  ${(option.price / option.pageCount).toFixed(2)}/page
                </p>
              </div>
            </div>

            {/* Features */}
            <ul className="space-y-1 ml-7 sm:ml-11">
              {option.features.slice(0, 2).map((feature, index) => (
                <li key={index} className="text-xs text-muted-foreground flex items-start gap-2">
                  <span className="text-primary flex-shrink-0 mt-0.5">•</span>
                  <span className="flex-1">{feature}</span>
                </li>
              ))}
            </ul>

            {/* Premium Badge */}
            {type === 'premium' && option.badge && (
              <div className="mt-2 ml-7 sm:ml-11">
                <span className="inline-block text-xs px-2 py-0.5 sm:py-1 rounded-full bg-gradient-to-r from-primary/20 to-purple-500/20 text-primary font-semibold">
                  ⭐ {option.badge}
                </span>
              </div>
            )}
          </motion.button>
        );
      })}
    </div>
  );
};
