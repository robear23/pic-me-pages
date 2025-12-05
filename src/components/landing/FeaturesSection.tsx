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
    <section className="relative py-16 bg-gradient-to-b from-muted/50 to-background">
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
                className="group relative text-center p-6"
              >
                {/* Icon with gradient background */}
                <div className="w-16 h-16 mx-auto mb-4 gradient-rainbow rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <Icon className="w-8 h-8 text-primary-foreground" />
                </div>
                
                <h3 className="text-lg font-bold mb-2 text-foreground">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
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
