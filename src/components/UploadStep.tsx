import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBookStore } from '@/store/bookStore';
import { Upload, X, User } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export const UploadStep = () => {
  const { characters, updateCharacter, setCharacterPhoto, setStep } = useBookStore();
  const [previews, setPreviews] = useState<Record<string, (string | null)[]>>({});
  const navigate = useNavigate();
  
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

  // Validation: character must have name + 1 photo (MVP: single character only)
  const character = characters[0];
  const isComplete = character.name.trim() !== '' && character.photos.some(p => p !== null);

  const handleReturnToDashboard = () => {
    navigate('/dashboard');
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen flex items-center justify-center px-6 pt-24 pb-12"
    >
      <div className="max-w-4xl w-full">
        {/* Return to Dashboard Button */}
        <div className="flex justify-end mb-6">
          <Button
            onClick={handleReturnToDashboard}
            variant="ghost"
            size="sm"
          >
            Return to Dashboard
          </Button>
        </div>

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
            Add 1 character • Share 1-3 photos
          </p>

          {/* Character Card */}
          <div className="mb-8">
            <CharacterCard
              character={character}
              charIndex={0}
              totalCharacters={1}
              previews={previews[character.id] || [null, null, null]}
              onNameChange={handleNameChange}
              onFileChange={handleFileChange}
              onRemove={() => {}} // No removal for single character
            />
          </div>

          {/* Next Button */}
          <Button
            onClick={() => setStep('complexity')}
            disabled={!isComplete}
            size="lg"
            className="w-full bg-gradient-to-r from-primary to-[hsl(330_80%_60%)] hover:scale-105 transition-transform duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            Next: Choose Complexity
          </Button>

          {!isComplete && (
            <p className="text-sm text-muted-foreground text-center mt-4">
              Please add a character name and at least one photo
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
          <h3 className="text-lg font-bold">Character {charIndex + 1}</h3>
        </div>
        {/* No delete button for single character MVP */}
      </div>

      {/* Name Input */}
      <div className="mb-6">
        <label className="text-sm font-medium mb-2 block">Character Name</label>
        <Input
          value={character.name}
          onChange={(e) => onNameChange(character.id, e.target.value)}
          placeholder="e.g., Sarah, Max, Luna"
          className="backdrop-blur-sm bg-input/50 border-glass-border"
        />
      </div>

      {/* Photo Upload Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Photos ({uploadedCount}/3)</label>
          <span className="text-xs text-muted-foreground">
            Upload 1-3 photos
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((photoIndex) => (
            <PhotoUploadBox
              key={photoIndex}
              photoIndex={photoIndex}
              fileInputRef={fileInputRefs[photoIndex]}
              preview={previews[photoIndex]}
              hasPhoto={character.photos[photoIndex] !== null}
              onFileChange={(file) => onFileChange(character.id, photoIndex, file)}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
};

interface PhotoUploadBoxProps {
  photoIndex: number;
  fileInputRef: React.RefObject<HTMLInputElement>;
  preview: string | null;
  hasPhoto: boolean;
  onFileChange: (file: File | null) => void;
}

const PhotoUploadBox = ({
  photoIndex,
  fileInputRef,
  preview,
  hasPhoto,
  onFileChange,
}: PhotoUploadBoxProps) => {
  return (
    <div
      onClick={() => !hasPhoto && fileInputRef.current?.click()}
      className={`
        relative aspect-square rounded-lg overflow-hidden cursor-pointer
        border-2 border-dashed transition-all duration-300
        ${hasPhoto
          ? 'border-primary bg-primary/10'
          : 'border-muted hover:border-primary bg-muted/20 hover:bg-muted/40'
        }
      `}
    >
      {hasPhoto && preview ? (
        <>
          <img
            src={preview}
            alt={`Photo ${photoIndex + 1}`}
            className="w-full h-full object-cover"
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFileChange(null);
            }}
            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-destructive/90 hover:bg-destructive flex items-center justify-center transition-all duration-200 hover:scale-110"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center p-2">
          <Upload className="w-6 h-6 text-muted-foreground mb-1" />
          <span className="text-xs text-muted-foreground text-center">
            {photoIndex === 0 ? 'Required' : 'Optional'}
          </span>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileChange(file);
        }}
        className="hidden"
      />
    </div>
  );
};
