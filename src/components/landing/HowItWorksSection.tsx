import { motion } from 'framer-motion';
import { Camera, Star, BookOpen } from 'lucide-react';

const steps = [
  {
    number: '1',
    icon: Camera,
    title: 'Upload Photo',
    description: 'Add 1 clear photo of your child. Our AI will learn their features to create consistent, recognizable illustrations.',
  },
  {
    number: '2',
    icon: Star,
    title: 'Choose Your Adventure',
    description: 'Pick as many interests as you like—or select from our curated stories to place your child in magical adventures.',
  },
  {
    number: '3',
    icon: BookOpen,
    title: 'Get Your Book',
    description: 'Download your personalized coloring book as a PDF or order a professionally printed copy with premium binding.',
  },
];

export const HowItWorksSection = () => {
  return (
    <section id="how-it-works" className="relative pt-8 pb-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4">How It Works</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Create a personalized coloring book in three simple steps
          </p>
        </motion.div>

        {/* Steps Grid */}
        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="relative bg-card border border-border rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow"
              >
                {/* Step Number Badge */}
                <div className="absolute -top-4 -left-4 w-12 h-12 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center text-2xl font-black text-primary-foreground shadow-lg">
                  {step.number}
                </div>

                {/* Icon */}
                <div className="w-16 h-16 mx-auto mb-6 bg-primary/10 rounded-2xl flex items-center justify-center">
                  <Icon className="w-8 h-8 text-primary" />
                </div>

                {/* Content */}
                <h3 className="text-2xl font-bold mb-3 text-center">{step.title}</h3>
                <p className="text-muted-foreground text-center leading-relaxed">
                  {step.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
