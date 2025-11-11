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
];

export const ExampleGallery = () => {
  return (
    <section className="py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl md:text-5xl font-black mb-4">
            See the Magic
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Every page is uniquely generated with your child as the star. These were created in under 2 minutes.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {examples.map((example, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ scale: 1.05 }}
              className="group relative"
            >
              <div className="bg-card/40 backdrop-blur-lg border border-border rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all">
                <img
                  src={example.src}
                  alt={example.alt}
                  className="w-full h-auto"
                  loading="lazy"
                />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-end p-6">
                <p className="text-sm text-foreground font-medium">
                  {example.alt}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="text-center text-muted-foreground mt-8 italic"
        >
          ✨ Every book is unique — no two are exactly alike
        </motion.p>
      </div>
    </section>
  );
};
