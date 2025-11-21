import { motion } from 'framer-motion';
import { Sparkles, Heart, Palette, Download } from 'lucide-react';

const features = [
  {
    icon: Sparkles,
    title: 'Truly Personalized',
    description: 'Not just their name—their actual face appears in every scene. Our AI creates consistent, recognizable illustrations that look like your child in each coloring page.',
    image: '/examples/complexity-detailed.png',
    reverse: false,
  },
  {
    icon: Heart,
    title: 'Unlimited Interest Options',
    description: 'Choose as many interests as you want, or pick from our story library to create the perfect adventure. Dinosaurs, space, princesses, sports—mix and match to create something uniquely theirs.',
    image: '/examples/complexity-medium.png',
    reverse: true,
  },
  {
    icon: Palette,
    title: 'Print-Ready Quality',
    description: 'Professional 300 DPI line art perfect for coloring with markers, crayons, or pencils. Each page is carefully designed with age-appropriate detail levels.',
    image: '/examples/complexity-simple.png',
    reverse: false,
  },
  {
    icon: Download,
    title: 'Flexible Formats',
    description: 'Download instantly as a PDF for at-home printing, or order premium printed books with coil or saddle-stitch binding. Perfect for gifts or keepsakes.',
    image: '/examples/complexity-detailed.png',
    reverse: true,
  },
];

export const FeaturesSection = () => {
  return (
    <section className="relative py-20 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className={`flex flex-col ${
                feature.reverse ? 'md:flex-row-reverse' : 'md:flex-row'
              } items-center gap-12 mb-24 last:mb-0`}
            >
              {/* Image */}
              <div className="flex-1 w-full">
                <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-border">
                  <img
                    src={feature.image}
                    alt={feature.title}
                    className="w-full h-auto"
                  />
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 w-full">
                <div className="max-w-xl">
                  <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
                    <Icon className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="text-3xl md:text-4xl font-bold mb-4">{feature.title}</h3>
                  <p className="text-lg text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
};
