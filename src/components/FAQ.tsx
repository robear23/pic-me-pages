import { motion } from 'framer-motion';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const faqs = [
  {
    question: 'How does the photo personalization work?',
    answer:
      'Upload 1 clear photo of your child, and our AI learns their facial features to create consistent, recognizable illustrations throughout the entire book. Each page will feature your child in different adventures.',
  },
  {
    question: 'Can I choose as many interests as I want?',
    answer:
      'Yes! Select as many interests as you\'d like. Our AI will create diverse pages incorporating your chosen themes—from dinosaurs and space to princesses and sports.',
  },
  {
    question: 'What\'s the difference between interests and stories?',
    answer:
      'Interests let you pick topics your child loves (dinosaurs, space, etc.), and we\'ll create unique scenes around those themes. Stories are pre-written adventures we\'ll place your child in—like becoming a brave knight or exploring a magical forest.',
  },
  {
    question: 'How long does it take to generate?',
    answer:
      'From upload to download, the entire process takes about 2-3 minutes. Our AI generates all pages in real-time, so you can start coloring right away!',
  },
  {
    question: 'Can I include multiple children?',
    answer:
      'Currently, each book features one child. However, you can create separate books for siblings, and we offer sibling discounts on multiple book purchases!',
  },
  {
    question: 'What if I don\'t like the results?',
    answer:
      'We want you to love your book! If you\'re not satisfied with the results, contact our support team within 7 days for a full refund or free regeneration with different settings.',
  },
  {
    question: 'What\'s the best way to print the PDF?',
    answer:
      'You\'ll receive a high-quality PDF optimized for 8.5" x 11" printing. Print it at home on regular printer paper or take it to any print shop for professional results. For best quality, use cardstock or heavier paper.',
  },
  {
    question: 'Do you offer refunds?',
    answer:
      'Yes! We offer a 7-day satisfaction guarantee. If you\'re not happy with your coloring book, contact us for a full refund—no questions asked.',
  },
  {
    question: 'What are the different binding options?',
    answer:
      'For printed books, we offer coil binding (lays flat for easy coloring) and saddle-stitch binding (like a traditional book). Both are premium quality and shipped directly to your door.',
  },
  {
    question: 'What age is this appropriate for?',
    answer:
      'Our coloring books are designed for children ages 3-8, but kids of all ages enjoy seeing themselves as the stars of their own adventures! You can adjust the complexity level when creating your book.',
  },
  {
    question: 'How many pages can I get?',
    answer:
      'All books include 12 unique coloring pages - the perfect amount for hours of creative fun!',
  },
  {
    question: 'Do I need to create an account?',
    answer:
      'Yes, you\'ll need to sign in or create an account to generate and access your books. This allows you to save your creations, reorder, and access your books from any device.',
  },
];

export const FAQ = () => {
  return (
    <section id="faq" className="relative py-20 bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-white">
            Frequently Asked Questions
          </h2>
          <p className="text-xl text-white/80">
            Everything you need to know about creating your personalized coloring book
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="bg-gray-900/80 border border-white/20 rounded-2xl p-6 md:p-8 shadow-lg"
        >
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`} className="border-b border-white/20 last:border-0">
                <AccordionTrigger className="text-left text-base md:text-lg font-semibold text-white hover:text-primary py-4">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-base text-white/70 leading-relaxed pb-4">
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
