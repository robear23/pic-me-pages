import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBookStore } from '@/store/bookStore';
import { Upload, X, User } from 'lucide-react';
import { useRef, useState } from 'react';

export const UploadStep = () => {
  const { characterName, characterPhotos, setCharacterName, setCharacterPhoto, setStep } = useBookStore();
  const [previews, setPreviews] = useState<(string | null)[]>([null, null, null]);
  const fileInputRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  const handleFileChange = (index: number, file: File | null) => {
    setCharacterPhoto(index, file);
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviews((prev) => {
          const newPreviews = [...prev];
          newPreviews[index] = reader.result as string;
          return newPreviews;
        });
      };
      reader.readAsDataURL(file);
    } else {
      setPreviews((prev) => {
        const newPreviews = [...prev];
        newPreviews[index] = null;
        return newPreviews;
      });
    }
  };

  const isComplete = characterName.trim() !== '' && characterPhotos.every((photo) => photo !== null);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen flex items-center justify-center px-6 pt-24 pb-12"
    >
      <div className="max-w-3xl w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="backdrop-blur-lg bg-glass-bg border border-glass-border rounded-2xl p-8 md:p-12"
        >
          <h2 className="font-black text-4xl md:text-5xl mb-4 text-center">
            Who's the Star of This Book?
          </h2>
          <p className="text-lg text-muted-foreground text-center mb-8">
            Tell us their name and share 3 photos
          </p>

          {/* Name Input */}
          <div className="mb-8">
            <label className="block text-sm font-medium mb-2">Child's Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                value={characterName}
                onChange={(e) => setCharacterName(e.target.value)}
                placeholder="Enter name..."
                className="pl-10 bg-input/50 backdrop-blur-sm border-glass-border h-12 text-lg"
              />
            </div>
          </div>

          {/* Photo Upload Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {[0, 1, 2].map((index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: 0.2 + index * 0.1 }}
              >
                <input
                  ref={fileInputRefs[index]}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileChange(index, file);
                  }}
                />
                <div
                  onClick={() => !previews[index] && fileInputRefs[index].current?.click()}
                  className={`relative aspect-square rounded-xl border-2 border-dashed transition-all duration-300 overflow-hidden group ${
                    previews[index]
                      ? 'border-secondary bg-secondary/10'
                      : 'border-glass-border bg-input/30 hover:bg-input/50 hover:border-primary cursor-pointer'
                  }`}
                >
                  {previews[index] ? (
                    <>
                      <img
                        src={previews[index]!}
                        alt={`Photo ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFileChange(index, null);
                          }}
                          variant="destructive"
                          size="sm"
                          className="rounded-full"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full p-4">
                      <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                      <span className="text-sm text-muted-foreground text-center">
                        Photo {index + 1}
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Next Button */}
          <Button
            onClick={() => setStep('interests')}
            disabled={!isComplete}
            size="lg"
            className="w-full bg-gradient-to-r from-primary to-[hsl(330_80%_60%)] hover:scale-105 transition-transform duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            Next Step
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
};
