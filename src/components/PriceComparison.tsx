import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, X } from 'lucide-react';
import { Button } from './ui/button';

export const PriceComparison = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="max-w-3xl mx-auto">
      <Button
        variant="ghost"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-accent/50 rounded-xl"
      >
        <span className="text-sm font-semibold">Compare Binding Types</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3 }}
        >
          <ChevronDown className="w-5 h-5" />
        </motion.div>
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="mt-4 backdrop-blur-xl bg-background/40 border-2 border-border rounded-xl p-6">
              <h3 className="text-lg font-bold mb-4 text-center">
                Standard vs Premium Coil Binding
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 font-semibold">Feature</th>
                      <th className="text-center py-3 px-4 font-semibold">Standard</th>
                      <th className="text-center py-3 px-4 font-semibold bg-primary/5 rounded-t-lg">
                        Premium Coil
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <ComparisonRow
                      feature="Binding Type"
                      standard="Saddle Stitch (Stapled)"
                      premium="Professional Coil"
                    />
                    <ComparisonRow
                      feature="Lays Completely Flat"
                      standard={false}
                      premium={true}
                    />
                    <ComparisonRow
                      feature="360° Page Rotation"
                      standard={false}
                      premium={true}
                    />
                    <ComparisonRow
                      feature="Durability"
                      standard="Good"
                      premium="Excellent"
                    />
                    <ComparisonRow
                      feature="Professional Appearance"
                      standard="Standard"
                      premium="Premium"
                    />
                    <ComparisonRow
                      feature="Easy Page Turning"
                      standard="Good"
                      premium="Outstanding"
                    />
                    <ComparisonRow
                      feature="Best For"
                      standard="Budget-conscious"
                      premium="Best coloring experience"
                      isLast
                    />
                  </tbody>
                </table>
              </div>

              <div className="mt-6 p-4 bg-primary/10 rounded-lg border border-primary/20">
                <p className="text-sm text-center">
                  <span className="font-bold">💡 Pro Tip:</span> Premium coil binding is our most popular choice! 
                  The book lays completely flat, making coloring easier and more enjoyable.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface ComparisonRowProps {
  feature: string;
  standard: string | boolean;
  premium: string | boolean;
  isLast?: boolean;
}

const ComparisonRow = ({ feature, standard, premium, isLast }: ComparisonRowProps) => {
  const renderCell = (value: string | boolean) => {
    if (typeof value === 'boolean') {
      return value ? (
        <Check className="w-5 h-5 text-green-500 mx-auto" />
      ) : (
        <X className="w-5 h-5 text-muted-foreground/30 mx-auto" />
      );
    }
    return <span className="text-muted-foreground">{value}</span>;
  };

  return (
    <tr className={!isLast ? 'border-b border-border/50' : ''}>
      <td className="py-3 px-4 font-medium">{feature}</td>
      <td className="py-3 px-4 text-center">{renderCell(standard)}</td>
      <td className="py-3 px-4 text-center bg-primary/5">
        {renderCell(premium)}
      </td>
    </tr>
  );
};
