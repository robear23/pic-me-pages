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
        className="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-accent/50 rounded-xl"
        aria-expanded={isOpen}
        aria-label="Compare binding types"
      >
        <span className="text-xs sm:text-sm font-semibold">Compare Binding Types</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3 }}
        >
          <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5" />
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
                Compare All Options
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-2 sm:px-4 font-semibold">Feature</th>
                      <th className="text-center py-3 px-2 sm:px-4 font-semibold">PDF</th>
                      <th className="text-center py-3 px-2 sm:px-4 font-semibold">Standard</th>
                      <th className="text-center py-3 px-2 sm:px-4 font-semibold bg-primary/5 rounded-t-lg">
                        Premium Coil
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <ComparisonRow
                      feature="Format"
                      pdf="Digital Download"
                      standard="Saddle Stitch (Stapled)"
                      premium="Professional Coil"
                    />
                    <ComparisonRow
                      feature="Delivery"
                      pdf="Instant"
                      standard="Shipped"
                      premium="Shipped"
                    />
                    <ComparisonRow
                      feature="Lays Completely Flat"
                      pdf="You print it"
                      standard={false}
                      premium={true}
                    />
                    <ComparisonRow
                      feature="360° Page Rotation"
                      pdf="You print it"
                      standard={false}
                      premium={true}
                    />
                    <ComparisonRow
                      feature="Durability"
                      pdf="Depends on printing"
                      standard="Good"
                      premium="Excellent"
                    />
                    <ComparisonRow
                      feature="Print Copies"
                      pdf="Unlimited"
                      standard="1"
                      premium="1"
                    />
                    <ComparisonRow
                      feature="Best For"
                      pdf="Budget & DIY"
                      standard="Budget-conscious"
                      premium="Best coloring experience"
                      isLast
                    />
                  </tbody>
                </table>
              </div>

              <div className="mt-6 p-4 bg-primary/10 rounded-lg border border-primary/20">
                <p className="text-sm text-center">
                  <span className="font-bold">💡 Pro Tip:</span> PDF downloads are perfect if you want to save money and print multiple copies. 
                  Premium coil binding is best if you want the ultimate coloring experience with professionally bound pages that lay flat!
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
  pdf?: string | boolean;
  standard: string | boolean;
  premium: string | boolean;
  isLast?: boolean;
}

const ComparisonRow = ({ feature, pdf, standard, premium, isLast }: ComparisonRowProps) => {
  const renderCell = (value: string | boolean | undefined) => {
    if (value === undefined) return <span className="text-muted-foreground">-</span>;
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
      <td className="py-3 px-4 text-center">{renderCell(pdf)}</td>
      <td className="py-3 px-4 text-center">{renderCell(standard)}</td>
      <td className="py-3 px-4 text-center bg-primary/5">
        {renderCell(premium)}
      </td>
    </tr>
  );
};
