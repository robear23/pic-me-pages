import { motion } from 'framer-motion';
import { Sparkles, Heart, Palette, Download } from 'lucide-react';

const features = [
  {
    icon: Sparkles,
    title: 'Truly Personalized',
    description: 'Your child\'s actual face appears in every scene with consistent, recognizable illustrations.',
  },
  {
    icon: Heart,
    title: 'Unlimited Options',
    description: 'Mix and match interests or use custom prompts to create the perfect adventure.',
  },
  {
    icon: Palette,
    title: 'Print-Ready Quality',
    description: 'Professional 300 DPI line art perfect for coloring with markers, crayons, or pencils.',
  },
  {
    icon: Download,
    title: 'Flexible Formats',
    description: 'Download as PDF for home printing or order premium printed books with professional binding.',
  },
];

export const FeaturesSection = () => {
  return (
    <section className="relative py-16 bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-card border border-border rounded-xl p-6 shadow-md hover:shadow-lg transition-shadow"
              >
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-bold mb-2 text-gray-900 dark:text-gray-100">{feature.title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
