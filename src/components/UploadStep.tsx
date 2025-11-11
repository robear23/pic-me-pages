import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBookStore } from '@/store/bookStore';
import { Upload, X, User, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';

export const UploadStep = () => {
  const { characters, addCharacter, removeCharacter, updateCharacter, setCharacterPhoto, setStep } = useBookStore();
  const [previews, setPreviews] = useState<Record<string, (string | null)[]>>({});
  
  const handleNameChange = (characterId: string, name: string) => {
    updateCharacter(characterId, { name });
  };

  const handleFileChange = (characterId: string, photoIndex: number, file: File | null) => {
    setCharacterPhoto(characterId, photoIndex, file);
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviews((prev) => {
          const charPreviews = prev[characterId] || [null, null, null];
          const newPreviews = [...charPreviews];
          newPreviews[photoIndex] = reader.result as string;
          return { ...prev, [characterId]: newPreviews };
        });
      };
      reader.readAsDataURL(file);
    } else {
      setPreviews((prev) => {
        const charPreviews = prev[characterId] || [null, null, null];
        const newPreviews = [...charPreviews];
        newPreviews[photoIndex] = null;
        return { ...prev, [characterId]: newPreviews };
      });
    }
  };

  const canAddMore = characters.length < 5;
  
  // Validation: at least 1 character with name + 1 photo
  const isComplete = characters.some(char => 
    char.name.trim() !== '' && char.photos.some(p => p !== null)
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen flex items-center justify-center px-6 pt-24 pb-12"
    >
      <div className="max-w-4xl w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="backdrop-blur-lg bg-glass-bg border border-glass-border rounded-2xl p-8 md:p-12"
        >
          <h2 className="font-black text-4xl md:text-5xl mb-4 text-center">
            Who's in This Book?
          </h2>
          <p className="text-lg text-muted-foreground text-center mb-8">
            Add up to 5 characters • Share 1-3 photos of each
          </p>

          {/* Characters List */}
          <div className="space-y-8 mb-8">
            {characters.map((character, charIndex) => (
              <CharacterCard
                key={character.id}
                character={character}
                charIndex={charIndex}
                totalCharacters={characters.length}
                previews={previews[character.id] || [null, null, null]}
                onNameChange={handleNameChange}
                onFileChange={handleFileChange}
                onRemove={() => removeCharacter(character.id)}
              />
            ))}
          </div>

          {/* Add Character Button */}
          {canAddMore && (
            <Button
              onClick={addCharacter}
              variant="outline"
              className="w-full mb-8 border-dashed border-2 h-14"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Another Character ({characters.length}/5)
            </Button>
          )}

          {/* Next Button */}
          <Button
            onClick={() => setStep('settings')}
            disabled={!isComplete}
            size="lg"
            className="w-full bg-gradient-to-r from-primary to-[hsl(330_80%_60%)] hover:scale-105 transition-transform duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            Next: Choose Style
          </Button>

          {!isComplete && (
            <p className="text-sm text-muted-foreground text-center mt-4">
              Add at least 1 character with a name and photo
            </p>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
};

interface CharacterCardProps {
  character: any;
  charIndex: number;
  totalCharacters: number;
  previews: (string | null)[];
  onNameChange: (id: string, name: string) => void;
  onFileChange: (id: string, photoIndex: number, file: File | null) => void;
  onRemove: () => void;
}

const CharacterCard = ({
  character,
  charIndex,
  totalCharacters,
  previews,
  onNameChange,
  onFileChange,
  onRemove,
}: CharacterCardProps) => {
  const fileInputRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  const uploadedCount = character.photos.filter((p: any) => p !== null).length;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay: charIndex * 0.1 }}
      className="border border-glass-border rounded-xl p-6 bg-input/20 backdrop-blur-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-lg">Character {charIndex + 1}</h3>
            <p className="text-xs text-muted-foreground">
              {uploadedCount} photo{uploadedCount !== 1 ? 's' : ''} uploaded
            </p>
          </div>
        </div>
        {totalCharacters > 1 && (
          <Button
            onClick={onRemove}
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Name Input */}
      <div className="mb-4">
        <Input
          value={character.name}
          onChange={(e) => onNameChange(character.id, e.target.value)}
          placeholder="Character name..."
          className="bg-background/50 backdrop-blur-sm border-glass-border"
        />
      </div>

      {/* Photo Upload Grid */}
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((photoIndex) => (
          <div key={photoIndex}>
            <input
              ref={fileInputRefs[photoIndex]}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onFileChange(character.id, photoIndex, file);
              }}
            />
            <div
              onClick={() => !previews[photoIndex] && fileInputRefs[photoIndex].current?.click()}
              className={`relative aspect-square rounded-lg border-2 border-dashed transition-all duration-300 overflow-hidden group ${
                previews[photoIndex]
                  ? 'border-secondary bg-secondary/10'
                  : 'border-glass-border bg-input/30 hover:bg-input/50 hover:border-primary cursor-pointer'
              }`}
            >
              {previews[photoIndex] ? (
                <>
                  <img
                    src={previews[photoIndex]!}
                    alt={`Photo ${photoIndex + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        onFileChange(character.id, photoIndex, null);
                      }}
                      variant="destructive"
                      size="sm"
                      className="rounded-full"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-2">
                  <Upload className="w-6 h-6 text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground text-center">
                    Photo {photoIndex + 1}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};
