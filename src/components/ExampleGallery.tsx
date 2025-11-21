import { motion } from 'framer-motion';

const examples = [
  {
    src: '/examples/complexity-simple.png',
    alt: 'Child as astronaut floating in space with planets',
  },
  {
    src: '/examples/complexity-medium.png',
    alt: 'Child riding a friendly dinosaur through a jungle',
  },
  {
    src: '/examples/complexity-detailed.png',
    alt: 'Child as an artist painting in a colorful studio',
  },
  {
    src: '/examples/complexity-simple.png',
    alt: 'Child playing soccer in a stadium',
  },
  {
    src: '/examples/complexity-medium.png',
    alt: 'Child as a princess in a magical castle',
  },
  {
    src: '/examples/complexity-detailed.png',
    alt: 'Child swimming with ocean creatures',
  },
];

export const ExampleGallery = () => {
  return (
    <section id="examples" className="relative py-20 overflow-hidden">
      {/* Background Gradient */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: 'linear-gradient(to bottom right, hsl(222 47% 11%), hsl(280 80% 20% / 0.2), hsl(222 47% 11%))',
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-foreground">See The Magic In Action</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Real examples of personalized coloring books featuring children in their favorite adventures
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {examples.map((example, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="group relative overflow-hidden rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-300"
            >
              <img
                src={example.src}
                alt={example.alt}
                className="w-full h-auto"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                <p className="text-sm text-foreground font-medium">
                  {example.alt}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
