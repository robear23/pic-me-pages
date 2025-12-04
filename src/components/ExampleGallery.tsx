import { motion } from 'framer-motion';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, User, FileText, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

const showcaseExamples = [
  {
    id: 1,
    childPhoto: '/placeholder.svg',
    prompt: 'A magical adventure with dinosaurs and space exploration',
    pages: ['/placeholder.svg', '/placeholder.svg', '/placeholder.svg', '/placeholder.svg'],
  },
  {
    id: 2,
    childPhoto: '/placeholder.svg',
    prompt: 'Princess castle adventure with friendly dragons',
    pages: ['/placeholder.svg', '/placeholder.svg', '/placeholder.svg', '/placeholder.svg'],
  },
  {
    id: 3,
    childPhoto: '/placeholder.svg',
    prompt: 'Underwater ocean explorer discovering sea creatures',
    pages: ['/placeholder.svg', '/placeholder.svg', '/placeholder.svg', '/placeholder.svg'],
  },
];

const PDFViewer = ({ pages }: { pages: string[] }) => {
  const [currentPage, setCurrentPage] = useState(0);

  return (
    <div className="flex flex-col">
      <div className="relative aspect-[3/4] bg-white rounded-lg overflow-hidden shadow-inner">
        <img
          src={pages[currentPage]}
          alt={`Page ${currentPage + 1}`}
          className="w-full h-full object-contain"
        />
      </div>
      <div className="flex items-center justify-center gap-3 mt-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
          disabled={currentPage === 0}
          className="h-8 px-2"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm text-muted-foreground min-w-[80px] text-center">
          Page {currentPage + 1} of {pages.length}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage(Math.min(pages.length - 1, currentPage + 1))}
          disabled={currentPage === pages.length - 1}
          className="h-8 px-2"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

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

        <div className="space-y-16">
          {showcaseExamples.map((example, index) => (
            <motion.div
              key={example.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 md:p-8"
            >
              <div className="grid md:grid-cols-3 gap-6 md:gap-8">
                {/* Child Photo */}
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 mb-3">
                    <User className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-muted-foreground">Child Photo</span>
                  </div>
                  <div className="aspect-square bg-white/10 rounded-xl overflow-hidden border border-white/20">
                    <img
                      src={example.childPhoto}
                      alt="Child"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>

                {/* Prompt Box */}
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-muted-foreground">Story Prompt</span>
                  </div>
                  <div className="flex-1 bg-white/10 rounded-xl p-5 border border-white/20 flex items-center">
                    <p className="text-foreground text-lg italic leading-relaxed">
                      "{example.prompt}"
                    </p>
                  </div>
                </div>

                {/* PDF Viewer */}
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-muted-foreground">Preview Book</span>
                  </div>
                  <div className="bg-white/10 rounded-xl p-4 border border-white/20">
                    <PDFViewer pages={example.pages} />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
