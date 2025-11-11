import { motion } from 'framer-motion';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const faqs = [
  {
    question: 'How does it work?',
    answer:
      'Simply upload 3 photos of your child, select their interests (like dinosaurs, space, or art), and our AI creates 12 unique coloring pages featuring them in scenarios they love. The whole process takes about 2 minutes!',
  },
  {
    question: 'What age is this appropriate for?',
    answer:
      'Our coloring books are designed for children ages 3-8, but kids of all ages enjoy seeing themselves as the stars of their own adventures! You can adjust the complexity level when creating your book.',
  },
  {
    question: 'Can I print it at home?',
    answer:
      'Absolutely! You will receive a high-quality PDF optimized for 8.5" x 11" printing. Print it at home or take it to any print shop. We also offer professional printed + bound books shipped directly to your door.',
  },
  {
    question: 'How long does it take to create?',
    answer:
      'From upload to download, the entire process takes about 2-3 minutes. Our AI generates all 12 pages in real-time, so you can start coloring right away!',
  },
  {
    question: 'Is my child\'s photo safe?',
    answer:
      'Yes! We take privacy seriously. Photos are only used to generate your coloring book and are never shared or used for any other purpose. You can delete them anytime from your account.',
  },
];

export const FAQ = () => {
  return (
    <section className="py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl md:text-5xl font-black mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-xl text-muted-foreground">
            Everything you need to know about creating your personalized coloring book
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="bg-card/40 backdrop-blur-lg border border-border rounded-2xl p-8"
        >
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-left text-lg font-semibold hover:text-primary">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-base text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
};
