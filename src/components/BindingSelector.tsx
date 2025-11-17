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
    <div className="space-y-3">
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
              w-full text-left p-4 rounded-xl border-2 transition-all duration-300
              ${isSelected 
                ? 'border-primary bg-primary/10 shadow-lg' 
                : 'border-border hover:border-primary/50 hover:bg-accent/50'
              }
            `}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className={`
                  p-2 rounded-lg transition-colors
                  ${isSelected 
                    ? 'bg-primary/20 text-primary' 
                    : 'bg-muted text-muted-foreground'
                  }
                `}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    {type === 'standard' ? 'Standard Binding' : 'Premium Coil'}
                    {isSelected && <Check className="w-4 h-4 text-primary" />}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {type === 'standard' ? 'Saddle Stitch' : 'Lays Flat'}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-primary">
                  ${option.price.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground">
                  ${(option.price / option.pageCount).toFixed(2)}/page
                </p>
              </div>
            </div>

            {/* Features */}
            <ul className="space-y-1 ml-11">
              {option.features.slice(0, 2).map((feature, index) => (
                <li key={index} className="text-xs text-muted-foreground flex items-center gap-2">
                  <span className="text-primary">•</span>
                  {feature}
                </li>
              ))}
            </ul>

            {/* Premium Badge */}
            {type === 'premium' && option.badge && (
              <div className="mt-2 ml-11">
                <span className="inline-block text-xs px-2 py-1 rounded-full bg-gradient-to-r from-primary/20 to-purple-500/20 text-primary font-semibold">
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
