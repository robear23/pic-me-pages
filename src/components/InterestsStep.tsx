import { motion } from 'framer-motion';
import { useState, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useBookStore, type SupportingCastMember } from '@/store/bookStore';
import { useUKBookStore } from '@/store/ukBookStore';
import { Sparkles, ArrowLeft, AlertTriangle, X, Upload, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Alert, AlertDescription } from './ui/alert';
import { Slider } from './ui/slider';

// SAFE PROMPT GUIDE: Activities that may need safety modifications
const POTENTIALLY_RISKY_INTERESTS = [
  'rock climbing', 'climbing', 'cycling', 'biking', 'bike', 'swimming', 'diving',
  'skiing', 'snowboarding', 'skateboarding', 'skating', 'football', 'soccer',
  'martial arts', 'karate', 'boxing', 'gymnastics', 'horse riding', 'archery',
  'surfing', 'trampoline', 'parkour'
];

// SAFE PROMPT GUIDE: Safe alternatives for risky interests
const SAFETY_MODIFICATIONS: Record<string, string> = {
  'rock climbing': 'indoor rock climbing with safety equipment',
  'climbing': 'indoor climbing with safety gear',
  'cycling': 'cycling with a helmet',
  'biking': 'biking with safety gear',
  'skateboarding': 'skateboarding with helmet and pads',
  'skating': 'skating with protective gear',
  'swimming': 'swimming with floaties',
  'football': 'playing catch',
  'soccer': 'kicking a ball in the garden',
  'martial arts': 'practicing exercise poses',
  'karate': 'doing stretches',
  'boxing': 'exercising',
  'gymnastics': 'dancing gracefully',
  'horse riding': 'visiting friendly animals',
  'archery': 'outdoor activities',
  'surfing': 'playing at the beach',
  'skiing': 'playing in the snow',
  'snowboarding': 'building a snowman',
  'trampoline': 'jumping happily',
  'parkour': 'exploring the neighborhood'
};

interface InterestsStepProps {
  isUKFlow?: boolean;
}

export const InterestsStep = ({ isUKFlow = false }: InterestsStepProps) => {
  const mainStore = useBookStore();
  const ukStore = useUKBookStore();
  
  const { 
    characters, 
    selectedInterests, 
    supportingCast,
    supportingCastPerPage,
    supportingCastPageCount,
    setInterests, 
    setSupportingCast,
    setSupportingCastPerPage,
    setSupportingCastPageCount,
    setStep 
  } = isUKFlow
    ? {
        characters: ukStore.characters,
        selectedInterests: ukStore.selectedInterests,
        supportingCast: ukStore.supportingCast,
        supportingCastPerPage: ukStore.supportingCastPerPage,
        supportingCastPageCount: ukStore.supportingCastPageCount,
        setInterests: ukStore.setSelectedInterests,
        setSupportingCast: ukStore.setSupportingCast,
        setSupportingCastPerPage: ukStore.setSupportingCastPerPage,
        setSupportingCastPageCount: ukStore.setSupportingCastPageCount,
        setStep: (step: string) => ukStore.setStep(step as any),
      }
    : {
        characters: mainStore.characters,
        selectedInterests: mainStore.selectedInterests,
        supportingCast: mainStore.supportingCast,
        supportingCastPerPage: mainStore.supportingCastPerPage,
        supportingCastPageCount: mainStore.supportingCastPageCount,
        setInterests: mainStore.setInterests,
        setSupportingCast: mainStore.setSupportingCast,
        setSupportingCastPerPage: mainStore.setSupportingCastPerPage,
        setSupportingCastPageCount: mainStore.setSupportingCastPageCount,
        setStep: mainStore.setStep,
      };

  const [interestsText, setInterestsText] = useState(selectedInterests.join(', '));
  const [castPreviews, setCastPreviews] = useState<(string | null)[]>(() => 
    supportingCast.map(c => typeof c.photo === 'string' ? c.photo : null)
  );
  const navigate = useNavigate();

  // Parse comma-separated interests
  const parsedInterests = interestsText
    .split(',')
    .map(i => i.trim())
    .filter(i => i.length > 0);
  
  // SAFE PROMPT GUIDE: Check for potentially risky interests
  const riskyInterests = useMemo(() => {
    const combined = parsedInterests.join(' ').toLowerCase();
    return POTENTIALLY_RISKY_INTERESTS.filter(risky => combined.includes(risky));
  }, [parsedInterests]);
  
  const hasRiskyInterests = riskyInterests.length > 0;
  
  // Valid if either interests OR supporting cast provided
  const hasSupportingCast = supportingCast.length > 0;
  const isComplete = parsedInterests.length >= 1 || hasSupportingCast;
  
  // Warning if cast uploaded but sliders at 0
  const showCastWarning = hasSupportingCast && 
    (supportingCastPerPage === 0 || supportingCastPageCount === 0);
  
  const handleNext = () => {
    // Apply safety modifications to interests
    let safeInterests = parsedInterests.map(interest => {
      const lowerInterest = interest.toLowerCase();
      for (const [risky, safe] of Object.entries(SAFETY_MODIFICATIONS)) {
        if (lowerInterest.includes(risky)) {
          return interest.replace(new RegExp(risky, 'gi'), safe);
        }
      }
      return interest;
    });
    
    setInterests(safeInterests);
    if (isUKFlow) {
      (setStep as any)('uk-product-selection');
    } else {
      setStep('book-options');
    }
  };

  const handleBack = () => {
    if (isUKFlow) {
      (setStep as any)('uk-complexity');
    } else {
      setStep('complexity');
    }
  };

  const handleReturnToDashboard = () => {
    navigate('/dashboard');
  };

  const handleCastPhotoUpload = (index: number, file: File) => {
    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      const newPreviews = [...castPreviews];
      newPreviews[index] = reader.result as string;
      setCastPreviews(newPreviews);
    };
    reader.readAsDataURL(file);
    
    // Add to supporting cast
    const newCast: SupportingCastMember[] = [...supportingCast];
    if (index < newCast.length) {
      newCast[index] = { ...newCast[index], photo: file };
    } else {
      newCast.push({
        id: Math.random().toString(36).substring(7),
        photo: file,
      });
    }
    setSupportingCast(newCast);
  };

  const handleRemoveCastPhoto = (index: number) => {
    const newCast = supportingCast.filter((_, i) => i !== index);
    const newPreviews = castPreviews.filter((_, i) => i !== index);
    setSupportingCast(newCast);
    setCastPreviews(newPreviews);
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
        {/* Navigation */}
        <div className="flex justify-between items-center mb-6">
          <Button
            onClick={handleBack}
            variant="ghost"
            size="sm"
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
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
            Interests & Supporting Cast
          </h2>
          <p className="text-lg text-muted-foreground text-center mb-8">
            Add quick interests and optionally include friends, siblings, or family members in the coloring book
          </p>

          {/* Quick Interests Input */}
          <div className="space-y-4 mb-8">
            <label className="text-sm font-semibold">Quick Interests (Optional)</label>
            <Textarea
              value={interestsText}
              onChange={(e) => setInterestsText(e.target.value)}
              placeholder="e.g., dinosaurs, space exploration, ocean animals, painting, soccer..."
              className="min-h-[100px] text-base backdrop-blur-sm bg-input/50 border-glass-border resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Separate interests with commas • {parsedInterests.length} interest{parsedInterests.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Safety Notice for Risky Interests */}
          {hasRiskyInterests && (
            <Alert className="mb-6 border-amber-500/50 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-sm">
                <span className="font-medium">Note:</span> We'll automatically adjust{' '}
                {riskyInterests.map((r, i) => (
                  <span key={r}>
                    <span className="font-semibold">"{r}"</span>
                    {i < riskyInterests.length - 1 ? ', ' : ''}
                  </span>
                ))}{' '}
                to be more suitable for AI-generated coloring book illustrations.
              </AlertDescription>
            </Alert>
          )}

          {/* Supporting Cast Section */}
          <div className="space-y-4 mb-8 p-6 backdrop-blur-lg bg-white/5 border border-glass-border rounded-xl">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <label className="text-sm font-semibold">Supporting Cast (Optional)</label>
            </div>
            <p className="text-xs text-muted-foreground">
              Upload photos of friends, siblings, pets, or family members to appear alongside the main character
            </p>
            
            {/* 5 Photo Upload Slots */}
            <div className="grid grid-cols-5 gap-3 mt-4">
              {[0, 1, 2, 3, 4].map((index) => (
                <SupportingCastUploadBox
                  key={index}
                  index={index}
                  preview={castPreviews[index] || null}
                  hasPhoto={index < supportingCast.length}
                  onUpload={(file) => handleCastPhotoUpload(index, file)}
                  onRemove={() => handleRemoveCastPhoto(index)}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Upload 1-5 supporting cast photos
            </p>
          </div>

          {/* Sliders - only enabled when at least 1 photo uploaded */}
          {hasSupportingCast && (
            <div className="space-y-6 mb-8 p-6 bg-white/5 rounded-xl border border-glass-border">
              {/* Slider 1: Cast per page */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium">Supporting cast members per page</label>
                  <span className="text-sm font-semibold text-primary">
                    {supportingCastPerPage} {supportingCastPerPage === 1 ? 'member' : 'members'}
                  </span>
                </div>
                <Slider
                  value={[supportingCastPerPage]}
                  onValueChange={([val]) => setSupportingCastPerPage(val)}
                  min={0}
                  max={Math.min(5, supportingCast.length)}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">
                  How many supporting cast members should appear with the main character in each page
                </p>
              </div>
              
              {/* Slider 2: Pages with cast */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium">Pages featuring supporting cast</label>
                  <span className="text-sm font-semibold text-primary">
                    {supportingCastPageCount} {supportingCastPageCount === 1 ? 'page' : 'pages'}
                  </span>
                </div>
                <Slider
                  value={[supportingCastPageCount]}
                  onValueChange={([val]) => setSupportingCastPageCount(val)}
                  min={0}
                  max={12}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">
                  How many pages should include the supporting cast (remaining pages will feature only the main character)
                </p>
              </div>
            </div>
          )}

          {/* Cast Warning */}
          {showCastWarning && (
            <Alert className="mb-6 border-amber-500/50 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-sm">
                You've uploaded supporting cast photos but haven't included them in any pages. Adjust the sliders to feature them.
              </AlertDescription>
            </Alert>
          )}

          {/* Generate Button */}
          <Button
            onClick={handleNext}
            disabled={!isComplete}
            size="lg"
            className="w-full bg-gradient-to-r from-primary to-[hsl(330_80%_60%)] hover:scale-105 transition-transform duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <Sparkles className="w-5 h-5 mr-2" />
            Continue to Book Options
          </Button>

          {!isComplete && (
            <p className="text-sm text-muted-foreground text-center mt-4">
              Please provide either interests or supporting cast photos
            </p>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
};

// Supporting Cast Upload Box Component
interface SupportingCastUploadBoxProps {
  index: number;
  preview: string | null;
  hasPhoto: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}

const SupportingCastUploadBox = ({
  index,
  preview,
  hasPhoto,
  onUpload,
  onRemove,
}: SupportingCastUploadBoxProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    if (!hasPhoto) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className={`
        relative aspect-square rounded-lg overflow-hidden cursor-pointer
        border-2 border-dashed transition-all duration-300 group
        ${hasPhoto 
          ? 'border-primary bg-primary/10' 
          : 'border-muted-foreground/30 hover:border-primary hover:bg-primary/5'}
      `}
    >
      {preview ? (
        <>
          <img 
            src={preview} 
            alt={`Supporting cast ${index + 1}`}
            className="w-full h-full object-cover"
          />
          {/* Remove button on hover */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="absolute top-1 right-1 p-1 bg-destructive rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="w-3 h-3 text-destructive-foreground" />
          </button>
        </>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
          <Upload className="w-4 h-4 mb-1" />
          <span className="text-[10px]">Photo {index + 1}</span>
        </div>
      )}
      
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
};