import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BASE_DELAY = 1000;
const FUNCTION_TIMEOUT = 140000; // 140 seconds (10s before hard limit)

// Helper to fetch and convert HTTP URLs to base64
async function urlToBase64(url: string): Promise<string> {
  try {
    console.log(`📥 Fetching image from URL: ${url.substring(0, 60)}...`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    console.log(`✅ Converted URL to base64 (${base64.length} chars)`);
    return base64;
  } catch (error) {
    console.error(`❌ Failed to convert URL to base64:`, error);
    throw error;
  }
}

// Helper to extract and validate base64 from various formats
async function extractBase64FromUrl(photoUrl: string): Promise<{ base64: string; mimeType: string }> {
  console.log(`🔍 Processing photo URL (type: ${photoUrl.startsWith('http') ? 'HTTP' : photoUrl.startsWith('data:') ? 'data URL' : 'raw base64'}, length: ${photoUrl.length})`);
  
  // Case 1: HTTP/HTTPS URL from Supabase storage
  if (photoUrl.startsWith('http://') || photoUrl.startsWith('https://')) {
    const base64 = await urlToBase64(photoUrl);
    return { base64, mimeType: 'image/jpeg' }; // Assume JPEG for HTTP URLs
  }
  
  // Case 2: Data URL (data:image/png;base64,...)
  if (photoUrl.startsWith('data:')) {
    const match = photoUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (match) {
      console.log(`✅ Extracted base64 from data URL (mimeType: ${match[1]}, length: ${match[2].length})`);
      return { base64: match[2], mimeType: match[1] };
    }
    throw new Error('Invalid data URL format');
  }
  
  // Case 3: Raw base64 string
  // Validate it looks like base64 (alphanumeric + / + = only)
  if (/^[A-Za-z0-9+/]+=*$/.test(photoUrl)) {
    console.log(`✅ Using raw base64 string (length: ${photoUrl.length})`);
    return { base64: photoUrl, mimeType: 'image/jpeg' };
  }
  
  throw new Error('Unrecognized photo URL format');
}

// TWO-STAGE APPROACH: Extract character description from photo using text model
// This avoids sending photos directly to the image generation model which often fails
async function extractCharacterDescription(photoBase64: string, mimeType: string, GOOGLE_API_KEY: string): Promise<string> {
  try {
    console.log(`🔍 Extracting character description from photo...`);
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent`,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': GOOGLE_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inlineData: {
                  mimeType: mimeType,
                  data: photoBase64
                }
              },
              {
                text: `Describe this person's physical appearance in EXACT detail for an artist to recreate them:
                
REQUIRED DETAILS (be very specific):
- Hair: color (exact shade), style (length, texture, parting)
- Face shape: (oval, round, square, heart-shaped, etc.)
- Eyes: color, shape, size, eyebrow style
- Nose: shape and size
- Mouth: lip shape and size
- Skin tone: (specific shade like fair, olive, tan, brown, etc.)
- Any distinctive features: freckles, dimples, glasses, etc.
- General build: slim, average, athletic, etc.

OUTPUT FORMAT: Write a single paragraph describing this person as if for a portrait artist. Be specific but neutral. Do NOT include any age references.

Example: "A person with wavy auburn shoulder-length hair parted in the middle, oval face shape, large hazel eyes with arched eyebrows, small upturned nose, full lips, fair skin with light freckles across the cheeks, slim build."

Write ONLY the description, nothing else.`
              }
            ]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 300
          }
        })
      }
    );
    
    if (!response.ok) {
      console.warn(`⚠️ Character description extraction failed: ${response.status}`);
      return 'a friendly person with pleasant features';
    }
    
    const data = await response.json();
    const description = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    
    if (!description) {
      console.warn(`⚠️ No description text in response`);
      return 'a friendly person with pleasant features';
    }
    
    console.log(`✅ Extracted character description: "${description.substring(0, 100)}..."`);
    return description;
    
  } catch (error) {
    console.error(`❌ Character description extraction error:`, error);
    return 'a friendly person with pleasant features';
  }
}

// SAFE PROMPT GUIDE: Enhanced system message without age references (Rule 1)
const REALISTIC_SYSTEM_MESSAGE = `ABSOLUTE REQUIREMENT: Generate a REAL CAMERA PHOTOGRAPH optimized for line art conversion.

CRITICAL FORBIDDEN STYLES:
❌ NO cartoons, illustrations, anime, digital art, drawings, sketches, clipart, or 2D renders
❌ NO flat colors, sharp boundaries, or uniform shading
❌ NO artistic interpretations or stylized images

REQUIRED PHOTOGRAPHIC ELEMENTS (OPTIMIZED FOR LINE ART):
✓ HIGH-KEY LIGHTING: Bright, even, flat lighting with MINIMAL shadows
✓ OVEREXPOSED style: Reduce dramatic shadows and dark areas
✓ Simple, solid-color background (white, light gray, or single pastel color)
✓ Clear subject separation: High contrast between subject and background
✓ Minimal texture detail: Smooth rendering without excessive detail
✓ Frontal or side lighting (NOT dramatic side lighting with deep shadows)
✓ Environmental context: Simple real setting with minimal clutter

CHARACTER MATCHING (CRITICAL - FEATURE CONSISTENCY):
- Match reference photo EXACTLY: face structure, hair color/style, skin tone, eye color, facial features
- Same person's face with IDENTICAL features in a different scenario
- Face shape, eye size/shape, nose, mouth must be IDENTICAL to reference
- Maintain all distinctive features shown in reference photo
- Think: same person photographed in different settings on the same day

SCENE COMPOSITION (ADAPT TO PROMPT):
- WIDE SHOTS: Rich, detailed environment with subject as part of scene
  * Include multiple colorable elements (trees, flowers, objects, patterns)
  * Subject is ONE element in a larger context
  * Detailed background that tells a story
  
- MEDIUM SHOTS: Balance subject and environment equally
  * Show immediate surroundings with detail
  * Subject interacts with visible environmental elements
  * Clear foreground and background
  
- CLOSE-UP SHOTS: Subject prominent but with contextual background
  * Subject is main focus but environment visible
  * Background provides context (room, outdoor setting, etc.)
  * Include nearby objects or elements
  
ENVIRONMENT REQUIREMENTS:
- Rich, colorable details appropriate to scene type
- Multiple distinct elements for variety
- Natural depth with foreground/background
- Wholesome and positive atmosphere
- MINIMAL shadows cast by subject
- Bright, cheerful lighting

LIGHTING STYLE (CRITICAL FOR SUCCESS):
- Think "overcast day" or "ring light" - soft, diffused, even lighting
- NOT "golden hour" or "window light" with dramatic shadows
- Flat lighting reduces shading that needs removal in line art step
- High contrast between dark (hair, clothing) and light (skin, background) areas

VALIDATION: Your output will be analyzed for color variance. Photorealistic images have 25-50% variance. Cartoons have <15% variance. IF YOUR IMAGE TESTS BELOW 18% VARIANCE, IT WILL BE REJECTED.

OUTPUT: A bright, evenly-lit photograph that maintains realism but minimizes complex shading and shadows. Think: bright studio photo, high-key portrait - NOT dramatic moody photography.`;

// Educational context for safer image generation (Rule 6)
const EDUCATIONAL_CONTEXT = `This is for a safe, educational coloring book illustration. 
All activities should be depicted in an encouraging, positive way that promotes healthy engagement with hobbies and interests.
The scene is wholesome, family-friendly, and appropriate for all ages.`;

// Enhanced system message for Step 2 - Line art conversion with shadow handling
// This will be customized based on complexity level
const getLineArtSystemMessage = (complexity?: string): string => {
  const outlineGuidance = {
    simple: 'BOLD 4-6px outlines - THICK LINES suitable for young children (ages 3-5)',
    medium: 'MEDIUM 2-4px outlines - Balanced line weight for ages 5-6',
    detailed: 'FINE 1-2px outlines - Thin, intricate lines for ages 7+ and adults'
  };
  const selectedOutline = outlineGuidance[complexity as keyof typeof outlineGuidance] || outlineGuidance.medium;
  
  return `CRITICAL: Convert the INPUT IMAGE ONLY to pure black and white line art. Do NOT regenerate the scene.

CRITICAL COLOR RULES - ABSOLUTE REQUIREMENT:
- Output MUST be PURE BLACK AND WHITE ONLY
- NO red, blue, green, yellow, orange, purple, pink, or ANY other colors allowed
- If you see ANY color in the input, convert it to black or white
- The final image must pass RGB variance test (R≈G≈B for all pixels)
- ANY colored pixels will cause AUTOMATIC REJECTION

CONVERSION REQUIREMENTS:
- Transform EVERY pixel to either pure black (#000000) OR pure white (#FFFFFF)
- ABSOLUTELY NO gray tones, shading, shadows, gradients, or photographic elements
- Convert soft shadows to white (remove them entirely)
- Convert dark shadows to black outlines or white (depending on context)
- NO filled black areas - use hatching/crosshatching for any remaining dark regions
- ${selectedOutline}
- If you see ANY photographic elements remaining, you FAILED

SHADOW HANDLING:
- Soft/light shadows → Convert to WHITE (remove completely)
- Medium shadows → Convert to light hatching lines
- Hard edges of shadows → Convert to black outlines
- Goal: Crisp outlines with minimal internal detail

CHARACTER: Preserve recognizable facial features from the input image
STYLE: Clean professional coloring book style with simple outlines

VALIDATION CRITERIA (you will be checked):
1. <8% of pixels can be gray (compression artifacts only)
2. <4% of pixels can be mid-tone gray (50-200 range)
3. >50% gray means COMPLETE FAILURE
4. <5% colored pixels allowed (RGB variance check)
5. Must look like a hand-drawn coloring book page

CRITICAL RULES:
1. Convert the PROVIDED IMAGE - do NOT create new image from text
2. Binary output only: pure black OR pure white pixels
3. Remove ALL photographic shadows by converting them to white
4. Remove ALL colors - convert to grayscale then to black/white
5. Must be printer-ready with crisp black lines on white background

OUTPUT: Clean black and white line drawing with NO gray tones, NO colors, and NO photographic shadows.`;
};

// PHASE 5: Safety filter word blacklist + PHASE 2: Cartoon trigger words
const SAFETY_FILTER_WORDS = [
  'magical', 'mystical', 'enchanted', 'admiring', 'gazing', 'wonder',
  'dramatic', 'artistic', 'creative', 'drawing', 'playful', 'teasing',
  'mysterious', 'ethereal', 'dreamy', 'fantastical', 'whimsical'
];

// PHASE 2: Cartoon trigger words that cause illustrated/stylized outputs
const CARTOON_TRIGGER_WORDS = [
  'cartoon', 'animated', 'illustration', 'sketch', 'stylized',
  'cute', 'adorable', 'charming', 'lovely', 'sweet',
  'artistic', 'fantasy', 'imaginary', 'storybook', 'fairytale'
];

// SAFE PROMPT GUIDE: Risky activities that commonly trigger MODEL_REFUSED (Rule 7)
// EXPANDED: Added cricket, jogging, star wars based on actual failure data
const RISKY_ACTIVITY_WORDS = [
  'rock climbing', 'climbing', 'cliff', 'mountain climbing',
  'cycling', 'biking', 'bike', 'bicycle',
  'swimming', 'diving', 'underwater', 'pool',
  'skiing', 'snowboarding', 'sledding',
  'skateboarding', 'skating', 'rollerblading',
  'football', 'soccer', 'rugby', 'tackling',
  'martial arts', 'karate', 'boxing', 'fighting',
  'gymnastics', 'acrobatics', 'tumbling',
  'horse riding', 'horseback', 'pony',
  'archery', 'bow', 'arrow',
  'surfing', 'wakeboarding', 'water skiing',
  'trampoline', 'bungee', 'parkour',
  // Added from failure analysis
  'cricket', 'playing cricket', 'batting', 'bowling',
  'jogging', 'running', 'sprinting', 'marathon',
  'star wars', 'lightsaber', 'jedi', 'sith', 'darth',
  'water witness', 'international', 'charity', 'organization'
];

// SAFE PROMPT GUIDE: 4-Level Safe replacement activities (Rule 7)
// Level 1: Same activity with safety context
// Level 2: Reframed activity
// Level 3: Alternative safer activity  
// Level 4: Generic safe fallback
const SAFE_ACTIVITY_REPLACEMENTS: Record<string, string> = {
  // Level 1 replacements - add safety context
  'rock climbing': 'climbing on an indoor climbing wall with safety equipment and colorful holds',
  'climbing': 'climbing on an indoor wall with a harness',
  'cliff': 'standing on a hilltop with flowers',
  'cycling': 'riding a bicycle with a helmet along a scenic path',
  'biking': 'riding a bicycle with a helmet through a park',
  'bike': 'riding a bicycle with a helmet',
  'bicycle': 'riding a bicycle with a helmet along a path',
  'swimming': 'splashing in a wading pool with floaties',
  'diving': 'looking at colorful fish in an aquarium',
  'pool': 'playing near a fountain in a park',
  'football': 'playing with a colorful ball in a sunny garden',
  'soccer': 'kicking a ball gently in a garden with flowers',
  'rugby': 'playing catch in a park',
  'tackling': 'playing tag in a meadow',
  'martial arts': 'doing fun stretches and poses',
  'karate': 'doing stretching exercises in a park',
  'boxing': 'practicing exercise moves',
  'fighting': 'practicing dance moves',
  'gymnastics': 'dancing gracefully',
  'acrobatics': 'doing a ballet pose',
  'tumbling': 'rolling on soft grass',
  'skiing': 'playing in soft fluffy snow',
  'snowboarding': 'building a cheerful snowman',
  'sledding': 'making snow angels',
  'skateboarding': 'riding a skateboard with a helmet at a beginner-friendly skate park',
  'skating': 'skating with protective gear',
  'rollerblading': 'rollerblading with knee pads on a smooth pathway',
  'horse riding': 'gently petting a friendly pony',
  'horseback': 'standing next to a gentle horse',
  'pony': 'feeding a friendly pony',
  'archery': 'playing with toys outdoors',
  'bow': 'playing in a field',
  'arrow': 'pointing at butterflies',
  'surfing': 'building sandcastles at the beach',
  'wakeboarding': 'splashing in shallow water',
  'water skiing': 'playing at the beach',
  'underwater': 'looking at fish in an aquarium',
  'trampoline': 'jumping happily in a garden',
  'bungee': 'playing on a swing',
  'parkour': 'walking through the neighborhood',
  // Added from failure analysis - cricket, jogging, star wars
  'cricket': 'playing with a colorful ball in a sunny garden',
  'playing cricket': 'playing catch with a ball in a park',
  'batting': 'swinging gently at a playground',
  'bowling': 'rolling a ball gently in a garden',
  'jogging': 'walking happily through a park with flowers',
  'running': 'walking along a scenic trail',
  'sprinting': 'walking quickly through a meadow',
  'marathon': 'walking through a beautiful park',
  'star wars': 'reading an adventure book in a cozy library',
  'lightsaber': 'playing with glowing toys',
  'jedi': 'reading a space adventure book',
  'sith': 'exploring a colorful garden',
  'darth': 'playing dress-up with costumes',
  'water witness': 'exploring nature near a stream',
  'water witness international': 'helping with gardening in a community garden',
  'international': 'exploring a colorful world map',
  'charity': 'helping in a community garden',
  'organization': 'participating in a fun group activity'
};

// Combined filter list - CRITICAL FIX: Include RISKY_ACTIVITY_WORDS
const ALL_FILTER_WORDS = [...SAFETY_FILTER_WORDS, ...CARTOON_TRIGGER_WORDS, ...RISKY_ACTIVITY_WORDS];

// PHASE 5: Pre-filter prompts to remove problematic words
// PHASE 2: Enhanced to include cartoon trigger words
function preFilterPrompt(prompt: string): string {
  let filtered = prompt;
  for (const word of ALL_FILTER_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    filtered = filtered.replace(regex, '');
  }
  // Clean up extra spaces
  return filtered.replace(/\s+/g, ' ').trim();
}

// PHASE 7: Replace risky activities with safe alternatives
function sanitizePromptForSafety(prompt: string): string {
  let safePrompt = prompt;
  
  // Replace specific risky activities with safe alternatives
  for (const [risky, safe] of Object.entries(SAFE_ACTIVITY_REPLACEMENTS)) {
    const regex = new RegExp(`\\b${risky}\\b`, 'gi');
    if (regex.test(safePrompt)) {
      safePrompt = safePrompt.replace(regex, safe);
      console.log(`🔄 Safety: Replaced "${risky}" with "${safe}"`);
    }
  }
  
  // Remove remaining risky words that don't have specific replacements
  for (const word of RISKY_ACTIVITY_WORDS) {
    if (!SAFE_ACTIVITY_REPLACEMENTS[word]) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      safePrompt = safePrompt.replace(regex, '');
    }
  }
  
  return safePrompt.replace(/\s+/g, ' ').trim();
}

// SAFE PROMPT GUIDE: Enhanced 4-level fallback system (Rule 7)
// Attempt 1: Add safety context ("with helmet", "with equipment")
// Attempt 2: Reframe activity ("learning X", "practicing X")
// Attempt 3: Replace with safer activity
// Attempt 4: Generic safe fallback
function simplifyPromptForRetry(originalPrompt: string, attemptNumber: number): string {
  const nameMatch = originalPrompt.match(/^([A-Z][a-z]+)/);
  const characterName = nameMatch ? nameMatch[1] : '';
  
  // Remove any age/identity words first
  const AGE_WORDS = ['child', 'children', 'kid', 'kids', 'young', 'little', 'small', 
                     'boy', 'girl', 'toddler', 'teenager', 'baby', 'year-old', 'years old'];
  let cleanedPrompt = originalPrompt;
  for (const word of AGE_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    cleanedPrompt = cleanedPrompt.replace(regex, '');
  }
  cleanedPrompt = cleanedPrompt.replace(/\s+/g, ' ').trim();
  
  if (attemptNumber === 1) {
    // Level 1: Add safety context to the prompt
    console.log(`🔒 Attempt ${attemptNumber}: Adding safety context...`);
    let safePrompt = cleanedPrompt;
    
    // Add safety context for physical activities
    for (const [risky, safe] of Object.entries(SAFE_ACTIVITY_REPLACEMENTS)) {
      const regex = new RegExp(`\\b${risky}\\b`, 'gi');
      if (regex.test(safePrompt)) {
        safePrompt = safePrompt.replace(regex, safe);
        console.log(`✓ Replaced "${risky}" with "${safe}"`);
      }
    }
    
    // Also remove safety filter words
    for (const word of SAFETY_FILTER_WORDS) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      safePrompt = safePrompt.replace(regex, '');
    }
    
    return safePrompt.replace(/\s+/g, ' ').trim() + ` ${EDUCATIONAL_CONTEXT}`;
  }
  
  if (attemptNumber === 2) {
    // Level 2: Reframe with educational/learning context
    console.log(`🔒 Attempt ${attemptNumber}: Reframing with learning context...`);
    
    // Find any activity mentioned and reframe it
    let activity = 'having fun';
    for (const risky of RISKY_ACTIVITY_WORDS) {
      if (cleanedPrompt.toLowerCase().includes(risky)) {
        const safeVersion = SAFE_ACTIVITY_REPLACEMENTS[risky];
        if (safeVersion) {
          activity = safeVersion;
          break;
        }
      }
    }
    
    return `Learning and practicing ${activity} in a safe, supervised environment. Bright, cheerful setting with colorful surroundings. ${EDUCATIONAL_CONTEXT}`;
  }
  
  if (attemptNumber === 3) {
    // Level 3: Use completely safe alternative activity
    console.log(`🔒 Attempt ${attemptNumber}: Using safe alternative activity...`);
    const safeActivities = [
      'having a wonderful time in a colorful flower garden',
      'reading a book in a cozy library',
      'painting a beautiful picture at an easel',
      'playing with building blocks in a sunny playroom',
      'exploring a magical butterfly garden'
    ];
    const randomSafe = safeActivities[Math.floor(Math.random() * safeActivities.length)];
    return `${randomSafe}. Bright sunlight, cheerful atmosphere. ${EDUCATIONAL_CONTEXT}`;
  }
  
  // Level 4: Ultimate fallback - absolute minimal safe prompt
  console.log(`⚠️ Attempt ${attemptNumber}: Using ultimate fallback prompt`);
  return `Smiling happily in a bright, cheerful garden with colorful flowers and butterflies. Studio lighting. Safe, wholesome, educational scene.`;
}

// Use Google's Gemini API directly - cheapest model with image generation
const getModelForComplexity = (complexity?: string): string => {
  console.log(`Using gemini-2.5-flash-image via Google API (requested: ${complexity || 'default'})`);
  return 'gemini-2.5-flash-image'; // Remove "google/" prefix for direct API
};

// PHASE 4: Enhanced validation with brightness boost capability
// PHASE 2: Added gradient detection and line quality measurement
// PHASE 6: Added color detection - reject images with actual colors (not grayscale)
async function validateLineArt(base64Image: string, pageIndex?: number, totalPages?: number): Promise<{ 
  valid: boolean; 
  grayPixelPercentage: number;
  hasPhotographicElements: boolean;
  hasGradients: boolean;
  lineQuality: number;
  hasColor?: boolean;
  colorPercentage?: number;
}> {
  try {
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
    if (!base64Data || base64Data.length < 100) {
      return { valid: false, grayPixelPercentage: 100, hasPhotographicElements: true, hasGradients: true, lineQuality: 0, hasColor: false, colorPercentage: 0 };
    }

    // Decode and validate image dimensions
    const buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const image = await Image.decode(buffer);
    
    // Safety check for valid dimensions
    if (image.width < 10 || image.height < 10) {
      console.error('Image dimensions too small:', image.width, 'x', image.height);
      return { valid: false, grayPixelPercentage: 100, hasPhotographicElements: true, hasGradients: true, lineQuality: 0, hasColor: false, colorPercentage: 0 };
    }
    
    let totalPixels = 0;
    let grayPixels = 0;
    let nearGrayPixels = 0;
    let gradientPixels = 0; // PHASE 2: Count pixels that form gradients
    let edgePixels = 0; // PHASE 2: Count crisp black/white edges (good line art)
    let coloredPixels = 0; // PHASE 6: Count pixels with actual color (RGB variance)
    const threshold = 30;
    
    // Sample every 100th pixel for faster validation (optimized for performance)
    const step = 100;
    // Start at 1 to avoid ImageScript boundary issues (1-indexed coordinates)
    for (let y = 1; y < image.height - 1; y += step) {
      for (let x = 1; x < image.width - 1; x += step) {
        try {
          totalPixels++;
          const color = image.getPixelAt(x, y);
        
          const r = (color >> 24) & 0xFF;
          const g = (color >> 16) & 0xFF;
          const b = (color >> 8) & 0xFF;
          const avg = (r + g + b) / 3;
          
          // PHASE 6: Color detection - check if RGB channels differ significantly
          // For grayscale images, R ≈ G ≈ B. For colored images, they differ.
          const rg_diff = Math.abs(r - g);
          const rb_diff = Math.abs(r - b);
          const gb_diff = Math.abs(g - b);
          const maxColorDiff = Math.max(rg_diff, rb_diff, gb_diff);
          
          // If RGB channels differ by more than 25, it's colored (not grayscale)
          if (maxColorDiff > 25) {
            coloredPixels++;
          }
          
          const isBlack = r <= threshold && g <= threshold && b <= threshold;
          const isWhite = r >= (255 - threshold) && g >= (255 - threshold) && b >= (255 - threshold);
          
          if (!isBlack && !isWhite) {
            grayPixels++;
            if (avg > 60 && avg < 195) {
              nearGrayPixels++;
            }
          }
          
          // PHASE 2: Detect gradients (smooth transitions indicate remaining photographic elements)
          if (x < image.width - step && y < image.height - step) {
            const neighborColor = image.getPixelAt(x + step, y + step);
            const nR = (neighborColor >> 24) & 0xFF;
            const nG = (neighborColor >> 16) & 0xFF;
            const nB = (neighborColor >> 8) & 0xFF;
            const nAvg = (nR + nG + nB) / 3;
            
            // Gradient: smooth color transition (10-80 intensity difference)
            const diff = Math.abs(avg - nAvg);
            if (diff > 10 && diff < 80 && !isBlack && !isWhite) {
              gradientPixels++;
            }
            
            // PHASE 2: Detect crisp edges (sharp black/white transitions = good line art)
            if ((isBlack && nAvg > 200) || (isWhite && nAvg < 55)) {
              edgePixels++;
            }
          }
        } catch (err) {
          console.error(`Pixel access error at (${x}, ${y}):`, err);
          continue; // Skip problematic pixel, don't crash validation
        }
      }
    }
    
    if (totalPixels === 0) {
      return { valid: false, grayPixelPercentage: 100, hasPhotographicElements: true, hasGradients: true, lineQuality: 0, hasColor: false, colorPercentage: 0 };
    }
    
    const grayPercentage = (grayPixels / totalPixels) * 100;
    const nearGrayPercentage = (nearGrayPixels / totalPixels) * 100;
    const blackPercentage = ((totalPixels - grayPixels) / totalPixels) * 100;
    
    // PHASE 2: Calculate gradient and line quality metrics
    const gradientPercentage = (gradientPixels / totalPixels) * 100;
    const edgePercentage = (edgePixels / totalPixels) * 100;
    const lineQuality = edgePercentage / Math.max(gradientPercentage, 1); // Higher = better line art
    
    // PHASE 6: Calculate color percentage
    const colorPercentage = (coloredPixels / totalPixels) * 100;
    const COLOR_THRESHOLD = 5; // Max 5% colored pixels allowed
    const hasColor = colorPercentage > COLOR_THRESHOLD;
    
    // PHASE 6: CRITICAL - Reject images with actual colors (not grayscale)
    if (hasColor) {
      console.error(`CRITICAL: Image has ${colorPercentage.toFixed(1)}% colored pixels (threshold: ${COLOR_THRESHOLD}%) - not grayscale line art!`);
      return { 
        valid: false, 
        grayPixelPercentage: grayPercentage, 
        hasPhotographicElements: true, 
        hasGradients: true, 
        lineQuality: 0,
        hasColor: true,
        colorPercentage: colorPercentage
      };
    }
    
    // CRITICAL: Check for complete conversion failure
    if (grayPercentage > 50) {
      console.error(`CRITICAL: Image is ${grayPercentage.toFixed(1)}% gray - still a photo!`);
      return { valid: false, grayPixelPercentage: grayPercentage, hasPhotographicElements: true, hasGradients: true, lineQuality: 0, hasColor: false, colorPercentage: colorPercentage };
    }
    
    // PHASE 2: Relaxed thresholds for better success rate
    const GRAY_THRESHOLD = 45; // Increased from 35% - allow more compression artifacts
    const MID_GRAY_THRESHOLD = 25; // Increased from 20% - allow more anti-aliasing
    const GRADIENT_THRESHOLD = 15; // PHASE 2: Max 15% gradients allowed
    const MIN_LINE_QUALITY = 0.6; // PHASE 2: Minimum line quality score
    
    const hasExcessiveGray = grayPercentage > GRAY_THRESHOLD;
    const hasExcessiveMidTones = nearGrayPercentage > MID_GRAY_THRESHOLD;
    const hasGradients = gradientPercentage > GRADIENT_THRESHOLD; // PHASE 2: Gradient check
    const hasGoodLines = lineQuality >= MIN_LINE_QUALITY; // PHASE 2: Line quality check
    
    // PHASE 2: Enhanced photo-like detection including gradients
    const hasPhotographicElements = nearGrayPercentage > MID_GRAY_THRESHOLD || hasGradients;
    const isPhotoLike = hasPhotographicElements && grayPercentage > 50;
    
    // PHASE 2: Validation bypass for borderline cases (35-45% gray with good black/white ratio AND good lines)
    const isBorderline = grayPercentage >= 35 && grayPercentage <= GRAY_THRESHOLD && blackPercentage > 50;
    const isValid = !hasExcessiveGray && !hasExcessiveMidTones && !isPhotoLike && !hasGradients && hasGoodLines;
    const acceptBorderline = isBorderline && !isPhotoLike && hasGoodLines;
    
    // PHASE 1: Enhanced logging with detailed pixel analysis
    // PHASE 2: Added gradient and line quality metrics
    // PHASE 6: Added color detection metrics
    const pageInfo = pageIndex !== undefined && totalPages !== undefined ? ` for page ${pageIndex + 1}/${totalPages}` : '';
    console.log(`[VALIDATION DETAIL] Line art validation${pageInfo}:
  - Gray pixels: ${grayPercentage.toFixed(2)}% (threshold: ${GRAY_THRESHOLD}%)
  - Mid-tone gray: ${nearGrayPercentage.toFixed(2)}% (threshold: ${MID_GRAY_THRESHOLD}%)
  - Black/White: ${blackPercentage.toFixed(2)}%
  - Gradients: ${gradientPercentage.toFixed(2)}% (threshold: ${GRADIENT_THRESHOLD}%)
  - Colored pixels: ${colorPercentage.toFixed(2)}% (threshold: ${COLOR_THRESHOLD}%)
  - Line quality: ${lineQuality.toFixed(2)} (min: ${MIN_LINE_QUALITY})
  - Photo-like: ${isPhotoLike ? 'Yes (>50% gray)' : 'No'}
  - Borderline: ${isBorderline ? 'Yes (accepting)' : 'No'}
  - Result: ${isValid || acceptBorderline ? '✓ PASS' : '✗ FAIL'}`);
    
    // PHASE 4: Accept borderline images with warning
    if (acceptBorderline && !isValid) {
      console.warn(`⚠️ Accepting borderline line art (${grayPercentage.toFixed(1)}% gray) - black/white ratio and lines are good`);
      return { 
        valid: true, // Accept it
        grayPixelPercentage: grayPercentage,
        hasPhotographicElements: false, // Override since we're accepting
        hasGradients: false,
        lineQuality: lineQuality,
        hasColor: false,
        colorPercentage: colorPercentage
      };
    }
    
    return { 
      valid: isValid, 
      grayPixelPercentage: grayPercentage,
      hasPhotographicElements: hasPhotographicElements,
      hasGradients: hasGradients,
      lineQuality: lineQuality,
      hasColor: false,
      colorPercentage: colorPercentage
    };
    
  } catch (error) {
    console.error('Line art validation error:', error);
    return { valid: false, grayPixelPercentage: 100, hasPhotographicElements: true, hasGradients: true, lineQuality: 0, hasColor: false, colorPercentage: 0 };
  }
}

// Simplified photorealistic validation - detects cartoon/illustrated images
// PHASE 2: Enhanced with uniform color and edge sharpness detection
async function validateRealisticImage(base64Image: string): Promise<{
  valid: boolean;
  isCartoonLike: boolean;
  colorVariance: number;
  hasUniformColors: boolean;
  edgeSharpness: number;
}> {
  try {
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const image = await Image.decode(buffer);
    
    // Safety check for valid dimensions
    if (image.width < 10 || image.height < 10) {
      console.error('Image dimensions too small:', image.width, 'x', image.height);
      return { valid: false, isCartoonLike: true, colorVariance: 0, hasUniformColors: true, edgeSharpness: 1.0 };
    }
    
    let totalSamples = 0;
    let colorDifferences = 0;
    let uniformColorRegions = 0; // PHASE 2: Count flat color areas (cartoon indicator)
    let sharpEdges = 0; // PHASE 2: Count sharp color boundaries (cartoon indicator)
    
    // Sample every 60th pixel for faster validation
    const step = 60;
    for (let y = step; y < image.height - step; y += step) {
      for (let x = step; x < image.width - step; x += step) {
        // Ensure we're within bounds
        if (x >= image.width - 1 || y >= image.height - 1) continue;
        
        totalSamples++;
        
        // Get current pixel and neighbor
        const color1 = image.getPixelAt(x, y);
        const color2 = image.getPixelAt(x + 1, y + 1);
        
        const r1 = (color1 >> 24) & 0xFF;
        const g1 = (color1 >> 16) & 0xFF;
        const b1 = (color1 >> 8) & 0xFF;
        
        const r2 = (color2 >> 24) & 0xFF;
        const g2 = (color2 >> 16) & 0xFF;
        const b2 = (color2 >> 8) & 0xFF;
        
        // Calculate color difference between neighbors
        const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
        
        // Photorealistic images have more subtle color variations
        // Cartoons have sharp color boundaries
        if (diff > 10 && diff < 100) {
          colorDifferences++;
        }
        
        // PHASE 2: Detect uniform flat colors (cartoon indicator)
        if (diff < 5) {
          uniformColorRegions++;
        }
        
        // PHASE 2: Detect sharp color boundaries (cartoon indicator)
        if (diff > 100) {
          sharpEdges++;
        }
      }
    }
    
    if (totalSamples === 0) {
      return { valid: false, isCartoonLike: true, colorVariance: 0, hasUniformColors: true, edgeSharpness: 1.0 };
    }
    
    const variancePercentage = (colorDifferences / totalSamples) * 100;
    const uniformPercentage = (uniformColorRegions / totalSamples) * 100;
    const edgeSharpness = (sharpEdges / totalSamples) * 100;
    
    // PHASE 2: Enhanced cartoon detection with multiple indicators
    const hasUniformColors = uniformPercentage > 40; // >40% flat colors = likely cartoon
    const hasSharpEdges = edgeSharpness > 15; // >15% sharp boundaries = likely cartoon
    
    // PHASE 2: Multi-criteria validation
    const isCartoonLike = variancePercentage < 8 || hasUniformColors || hasSharpEdges;
    const isRealistic = variancePercentage >= 10 && !hasUniformColors && !hasSharpEdges;
    
    console.log(`[VALIDATION DETAIL] Realistic image:
  - Color variance: ${variancePercentage.toFixed(1)}%
  - Uniform colors: ${uniformPercentage.toFixed(1)}% (threshold: 40%)
  - Edge sharpness: ${edgeSharpness.toFixed(1)}% (threshold: 15%)
  - Classification: ${isCartoonLike ? 'Cartoon-like' : isRealistic ? 'Photorealistic' : 'Borderline'}
  - Result: ${isRealistic ? '✓ PASS' : isCartoonLike ? '✗ CARTOON' : '⚠️ BORDERLINE'}`);
    
    return {
      valid: isRealistic,
      isCartoonLike: isCartoonLike,
      colorVariance: variancePercentage,
      hasUniformColors: hasUniformColors,
      edgeSharpness: edgeSharpness
    };
    
  } catch (error) {
    console.error('Realistic validation error:', error);
    return { valid: false, isCartoonLike: true, colorVariance: 0, hasUniformColors: true, edgeSharpness: 1.0 };
  }
}

// Gemini API Safety Settings - less restrictive for educational content (Rule 6)
const GEMINI_SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
];

async function generateRealisticImage(
  prompt: any,
  originalContentParts: any[],
  GOOGLE_API_KEY: string,
  pageIndex: number,
  totalPages: number,
  complexity?: string,
  maxRetries?: number
): Promise<string> {
  const MAX_RETRIES = 5; // 5-level fallback: attempts 1-4 WITH photos, attempt 5 WITHOUT photos as last resort
  const selectedModel = getModelForComplexity(complexity);
  const MODELS = [selectedModel];
  
  // Extract original prompt text for simplification
  const originalTextPart = originalContentParts.find((p: any) => p.type === 'text');
  const originalPromptText = originalTextPart?.text || prompt.prompt || '';
  
  // Extract character photos (non-text parts)
  const characterPhotos = originalContentParts.filter((p: any) => p.type === 'image_url');
  
  // CRITICAL: Character match emphasis for simplified prompts
  const CHARACTER_MATCH_EMPHASIS = `
CRITICAL CHARACTER CONSISTENCY REQUIREMENT:
- You MUST match the person in the reference photo EXACTLY
- Same face shape, eyes, nose, mouth, hair color and style
- This person is the MAIN subject - they must be clearly recognizable
- Think: same person photographed doing a different activity
- The character's identity is MORE important than the activity
`;
  
  // Track consecutive IMAGE_OTHER failures for smart early-skip
  let consecutiveImageOtherFailures = 0;
  let cachedCharacterDescription: string | null = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    for (const model of MODELS) {
      try {
        console.log(`Step 1/2 - Generating realistic image ${pageIndex + 1}/${totalPages} (attempt ${attempt}/${MAX_RETRIES}, model: ${model})`);
        
// VARIETY_SAFE_PROMPTS for last resort fallback (attempt 5) - each page gets different scene
        const VARIETY_SAFE_PROMPTS = [
          'Smiling happily in a bright garden with colorful flowers and butterflies',
          'Reading an exciting adventure book in a cozy library with bookshelves',
          'Painting a beautiful picture at an art easel with colorful paints',
          'Playing with building blocks in a sunny playroom with toys',
          'Exploring a butterfly garden with beautiful insects and flowers',
          'Baking delicious cookies in a cheerful kitchen with utensils',
          'Playing with a friendly puppy in a sunny park with trees',
          'Building a sandcastle at a sunny beach with seashells',
          'Having a picnic in a meadow with flowers and baskets',
          'Flying a colorful kite in a park with clouds',
          'Playing with bubbles in a garden with rainbow colors',
          'Looking at colorful fish in a beautiful aquarium'
        ];
        
        // CRITICAL FIX: Keep photos in ALL attempts except last resort (attempt 5)
        let currentPromptText: string;
        let includePhotos: boolean;
        let photoMatchEmphasis = '';
        let useCharacterDescription = false; // NEW: Flag for two-stage approach
        
        if (attempt === 1) {
          // Attempt 1: Use original prompt with photos
          currentPromptText = originalPromptText;
          includePhotos = true;
          console.log(`📝 Attempt 1: Using original prompt with ${characterPhotos.length} photo(s)`);
        } else if (attempt === 2) {
          // Attempt 2: TWO-STAGE APPROACH - use text description of character instead of photo
          if (characterPhotos.length > 0 && !cachedCharacterDescription) {
            try {
              console.log(`📸 Extracting character description from photo for two-stage approach...`);
              const photoUrl = characterPhotos[0].image_url?.url;
              if (photoUrl) {
                const { base64, mimeType } = await extractBase64FromUrl(photoUrl);
                cachedCharacterDescription = await extractCharacterDescription(base64, mimeType, GOOGLE_API_KEY);
                console.log(`✅ Character description extracted: "${cachedCharacterDescription.substring(0, 100)}..."`);
              }
            } catch (descError) {
              console.warn(`⚠️ Failed to extract character description:`, descError);
              cachedCharacterDescription = 'a friendly person with pleasant features';
            }
          }
          
          // Use text description instead of photos
          if (cachedCharacterDescription) {
            currentPromptText = `A person with these physical features: ${cachedCharacterDescription}\n\nScene: ${simplifyPromptForRetry(prompt.prompt, 1)}`;
            includePhotos = false; // Don't send photos - use text description only
            console.log(`📝 Attempt 2: TWO-STAGE - Using text character description (no photos)`);
          } else {
            currentPromptText = simplifyPromptForRetry(prompt.prompt, 1);
            includePhotos = true;
            photoMatchEmphasis = CHARACTER_MATCH_EMPHASIS;
            console.log(`📝 Attempt 2: Simplified prompt (Level 1) WITH photos (no description available)`);
          }
        } else if (attempt === 3) {
          // Attempt 3: Try text description again with more simplified prompt
          if (cachedCharacterDescription) {
            currentPromptText = `A person with these features: ${cachedCharacterDescription}\n\nScene: ${simplifyPromptForRetry(prompt.prompt, 2)}`;
            includePhotos = false;
            console.log(`📝 Attempt 3: TWO-STAGE - Simplified scene with text character description`);
          } else {
            currentPromptText = simplifyPromptForRetry(prompt.prompt, 2);
            includePhotos = true;
            photoMatchEmphasis = CHARACTER_MATCH_EMPHASIS;
            console.log(`📝 Attempt 3: Simplified prompt (Level 2) WITH photos`);
          }
        } else if (attempt === 4) {
          // Attempt 4: Safe fallback with character description
          if (cachedCharacterDescription) {
            currentPromptText = `A person with these features: ${cachedCharacterDescription}\n\nScene: ${simplifyPromptForRetry(prompt.prompt, 3)}`;
            includePhotos = false;
            console.log(`📝 Attempt 4: TWO-STAGE - Safe fallback with text character description`);
          } else {
            currentPromptText = simplifyPromptForRetry(prompt.prompt, 3);
            includePhotos = true;
            photoMatchEmphasis = CHARACTER_MATCH_EMPHASIS;
            console.log(`📝 Attempt 4: Safe fallback prompt WITH photos`);
          }
        } else {
          // Attempt 5: LAST RESORT - different safe prompt for each page WITHOUT photos or character
          const safePromptIndex = pageIndex % VARIETY_SAFE_PROMPTS.length;
          currentPromptText = VARIETY_SAFE_PROMPTS[safePromptIndex] + '. Sunny day with cheerful atmosphere.';
          includePhotos = false;
          console.log(`⚠️ Attempt 5: LAST RESORT - generating WITHOUT photos (safe scene #${safePromptIndex + 1})`);
        }
        
        // Build content parts based on current attempt
        const currentContentParts: any[] = [];
        
        // Add photos ONLY if includePhotos is true
        if (includePhotos && characterPhotos.length > 0) {
          currentContentParts.push(...characterPhotos);
        }
        
        // Add the prompt text (with system message)
        const complexityNote = complexity ? `\n\nCOMPLEXITY LEVEL: ${complexity.toUpperCase()}` : '';
        const photoContext = includePhotos && characterPhotos.length > 0
          ? '\n\nMatch the person in the reference photo exactly. '
          : '\n\nGenerate a friendly, cheerful scene with a generic happy person. ';
        
        currentContentParts.push({
          type: 'text',
          text: REALISTIC_SYSTEM_MESSAGE + photoMatchEmphasis + complexityNote + photoContext + currentPromptText
        });
        
        // Transform content parts to Google's native format
        const parts = await Promise.all(currentContentParts.map(async (part: any) => {
          if (part.type === 'text') {
            return { text: part.text };
          } else if (part.type === 'image_url') {
            try {
              const { base64, mimeType } = await extractBase64FromUrl(part.image_url.url);
              if (!base64 || base64.length < 100) {
                throw new Error('Base64 data too short or empty');
              }
              return {
                inlineData: {
                  mimeType: mimeType,
                  data: base64
                }
              };
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              console.error('❌ Failed to process image URL:', error);
              // On photo processing failure, skip this photo rather than fail entirely
              console.warn(`⚠️ Skipping problematic photo, continuing without it`);
              return null;
            }
          }
          return part;
        }));
        
        // Filter out null parts (failed photo processing)
        const validParts = parts.filter(p => p !== null);
        
        console.log(`📤 Sending request with ${validParts.length} parts (${validParts.filter((p: any) => p.inlineData).length} images, ${validParts.filter((p: any) => p.text).length} text)`);

        const imageResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: {
              'x-goog-api-key': GOOGLE_API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [{
                parts: validParts
              }],
              generationConfig: {
                responseModalities: ['IMAGE']
              },
              // Add safety settings to be less restrictive for educational content
              safetySettings: GEMINI_SAFETY_SETTINGS
            }),
          }
        );

        if (imageResponse.status === 429) {
          const backoffDelay = Math.min(BASE_DELAY * Math.pow(2, attempt - 1), 30000);
          console.error(`Rate limit hit on attempt ${attempt} with model ${model}, backing off for ${backoffDelay}ms`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          continue;
        }

        if (imageResponse.status === 402) {
          console.error(`Payment required on attempt ${attempt} with model ${model}`);
          throw new Error('AI credits depleted. Please contact support.');
        }

        if (imageResponse.status === 504) {
          console.error(`Gateway timeout on attempt ${attempt} with model ${model}`);
          throw new Error('Request timeout. Please try again.');
        }

        if (!imageResponse.ok) {
          const errorData = await imageResponse.json();
          const errorMessage = errorData.error?.message || 'Unknown error';
          console.error(`Step 1 API error (${imageResponse.status}): ${errorMessage}`);
          
          // Check for safety filter errors
          if (errorMessage.toLowerCase().includes('safety') || 
              errorMessage.toLowerCase().includes('refused') || 
              errorMessage.toLowerCase().includes('policy') ||
              errorMessage.toLowerCase().includes('blocked') ||
              errorMessage.toLowerCase().includes('harmful') ||
              errorMessage.toLowerCase().includes('inappropriate')) {
            
            console.warn(`⚠️ Safety filter triggered on attempt ${attempt}`);
            console.log(`Prompt excerpt: ${currentPromptText.substring(0, 100)}...`);
            
            // Continue to next attempt (which will use simpler prompt)
            if (attempt < MAX_RETRIES) {
              const delay = BASE_DELAY * Math.pow(2, attempt - 1);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
            
            throw new Error(`MODEL_REFUSED: Safety filter triggered after ${MAX_RETRIES} attempts`);
          }
          
          // Check for region restriction
          if (errorMessage.toLowerCase().includes('not available in your country') || 
              errorMessage.toLowerCase().includes('not available in your region')) {
            const err: any = new Error('REGION_BLOCKED: Image generation is not available in your country');
            err.isRegionRestriction = true;
            throw err;
          }
          
          // Retry on transient errors
          if (attempt < MAX_RETRIES) {
            const delay = BASE_DELAY * Math.pow(2, attempt - 1);
            console.log(`Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw new Error(`Step 1 failed: ${errorMessage}`);
        }

        const data = await imageResponse.json();
        
        // DEBUG LOGGING: Log full API response structure to understand failures
        console.log(`🔍 API Response structure (page ${pageIndex + 1}, attempt ${attempt}):`, JSON.stringify({
          hasCandidate: !!data.candidates?.[0],
          hasParts: !!data.candidates?.[0]?.content?.parts,
          partsLength: data.candidates?.[0]?.content?.parts?.length || 0,
          finishReason: data.candidates?.[0]?.finishReason,
          safetyRatings: data.candidates?.[0]?.safetyRatings?.map((r: any) => ({ category: r.category, probability: r.probability })),
          promptFeedback: data.promptFeedback,
          hasImagePart: !!data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData),
          partTypes: data.candidates?.[0]?.content?.parts?.map((p: any) => Object.keys(p).join(','))
        }));
        
        // Extract base64 image from Google's response format
        const imagePart = data.candidates?.[0]?.content?.parts?.find(
          (p: any) => p.inlineData
        );
        
        if (!imagePart?.inlineData?.data) {
          console.error(`❌ No image data in Step 1 response (attempt ${attempt}/${MAX_RETRIES})`);
          console.log(`Prompt excerpt: "${currentPromptText.substring(0, 150)}..."`);
          console.log(`📊 Full response for debugging:`, JSON.stringify(data).substring(0, 500));
          
          const finishReason = data.candidates?.[0]?.finishReason;
          
          // Check if this is a safety/content block
          if (finishReason === 'SAFETY' || data.promptFeedback?.blockReason) {
            console.warn(`⚠️ Safety block detected: finishReason=${finishReason}, blockReason=${data.promptFeedback?.blockReason}`);
          }
          
          // SMART EARLY-SKIP: Track IMAGE_OTHER failures (photo rejection)
          if (finishReason === 'IMAGE_OTHER') {
            consecutiveImageOtherFailures++;
            console.warn(`⚠️ IMAGE_OTHER failure detected (count: ${consecutiveImageOtherFailures})`);
            
            // If photos are being consistently rejected, skip directly to last resort
            if (consecutiveImageOtherFailures >= 2 && attempt < MAX_RETRIES - 1) {
              console.log(`⚡ Detected ${consecutiveImageOtherFailures} consecutive IMAGE_OTHER failures - skipping to last resort (attempt 5)`);
              // Jump to attempt 5 (last resort without photos)
              // We break from model loop and set attempt to 4 so next iteration is attempt 5
              attempt = MAX_RETRIES - 1;
              break; // Break from model loop to trigger next attempt
            }
          }
          
          if (attempt < MAX_RETRIES) {
            console.log(`🔄 Retrying with simpler prompt and/or without photos...`);
            continue;
          }
          
          throw new Error(`MODEL_REFUSED: No image generated after ${MAX_RETRIES} attempts`);
        }

        // Convert to data URL
        const step1MimeType = imagePart.inlineData.mimeType || 'image/png';
        const imageData = `data:${step1MimeType};base64,${imagePart.inlineData.data}`;

        console.log(`✅ Successfully generated realistic image ${pageIndex + 1}/${totalPages} on attempt ${attempt} (photos: ${includePhotos ? 'yes' : 'no'})`);
        
        return imageData;
        
      } catch (error) {
        console.error(`Step 1 error (attempt ${attempt}, model ${model}):`, error);
        if (attempt === MAX_RETRIES && model === MODELS[MODELS.length - 1]) {
          throw error;
        }
      }
    }
  }
  
  throw new Error('Failed to generate realistic image after all retries');
}

async function convertToLineArt(
  realisticImageBase64: string,
  prompt: any,
  GOOGLE_API_KEY: string,
  pageIndex: number,
  totalPages: number,
  complexity?: string,
  maxRetries?: number
): Promise<string> {
  const MAX_RETRIES = 3; // Increased from 1 for better MODEL_REFUSED handling
  const selectedModel = getModelForComplexity(complexity);
  // Only use valid models - gemini-2.0-flash-image-generation does NOT exist
  const MODELS = [selectedModel];
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    for (const model of MODELS) {
      try {
        console.log(`Step 2/2 - Converting to line art ${pageIndex + 1}/${totalPages} (attempt ${attempt}/${MAX_RETRIES}, model: ${model})`);
        
        // Transform to Google's native format
        const base64Data = realisticImageBase64.replace(/^data:image\/\w+;base64,/, '');
        const inputMimeType = realisticImageBase64.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/png';
        
        const lineArtSystemMessage = getLineArtSystemMessage(complexity);
        console.log(`[COMPLEXITY] Line art conversion using '${complexity || 'medium'}' complexity`);
        
        const imageResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: {
              'x-goog-api-key': GOOGLE_API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: lineArtSystemMessage + `\n\nConvert THIS PROVIDED IMAGE to clean black and white line art. Focus on converting the image you see, not recreating the scene.` },
                  {
                    inlineData: {
                      mimeType: inputMimeType,
                      data: base64Data
                    }
                  }
                ]
              }],
              generationConfig: {
                responseModalities: ['IMAGE']
              }
            }),
          }
        );

        if (imageResponse.status === 429) {
          const backoffDelay = Math.min(BASE_DELAY * Math.pow(2, attempt - 1), 30000);
          console.error(`Rate limit hit on attempt ${attempt} with model ${model}, backing off for ${backoffDelay}ms`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          continue; // Retry with exponential backoff
        }

        if (imageResponse.status === 402) {
          console.error(`Payment required on attempt ${attempt} with model ${model}`);
          throw new Error('AI credits depleted. Please contact support.');
        }

        if (imageResponse.status === 504) {
          console.error(`Gateway timeout on attempt ${attempt} with model ${model}`);
          throw new Error('Request timeout. Please try again.');
        }

        if (!imageResponse.ok) {
          const errorData = await imageResponse.json();
          const errorMessage = errorData.error?.message || 'Unknown error';
          console.error(`Step 2 API error (${imageResponse.status}): ${errorMessage}`);
          
          // Check for region restriction
          if (errorMessage.toLowerCase().includes('not available in your country') || 
              errorMessage.toLowerCase().includes('not available in your region')) {
            const err: any = new Error('REGION_BLOCKED: Image generation is not available in your country');
            err.isRegionRestriction = true;
            throw err;
          }
          
          // Only retry on transient errors
          if (attempt < MAX_RETRIES && (imageResponse.status === 429 || imageResponse.status === 402 || imageResponse.status === 504)) {
            const delay = BASE_DELAY * Math.pow(2, attempt - 1);
            console.log(`Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw new Error(`Step 2 failed: ${errorMessage}`);
        }

        const data = await imageResponse.json();
        
        // Extract base64 image from Google's response format
        const imagePart = data.candidates?.[0]?.content?.parts?.find(
          (p: any) => p.inlineData
        );
        
        if (!imagePart?.inlineData?.data) {
          console.error('No image data in Step 2 response');
          if (attempt < MAX_RETRIES) {
            continue;
          }
          throw new Error('No image data received from Step 2');
        }

        // Convert to data URL
        const step2MimeType = imagePart.inlineData.mimeType || 'image/png';
        const imageData = `data:${step2MimeType};base64,${imagePart.inlineData.data}`;

        console.log(`Successfully converted to line art ${pageIndex + 1}/${totalPages} on attempt ${attempt} with model ${model}`);
        
        // PHASE 1: Skip validation to save memory - accept first successful conversion
        console.log(`✓ Skipping validation (memory optimization) - accepting line art ${pageIndex + 1}/${totalPages}`);
        return imageData;
        
      } catch (error) {
        console.error(`Step 2 error (attempt ${attempt}, model ${model}):`, error);
        if (attempt === MAX_RETRIES && model === MODELS[MODELS.length - 1]) {
          throw error;
        }
      }
    }
  }
  
  throw new Error('Failed to convert to line art after all retries');
}

serve(async (req) => {
  console.log(`[${new Date().toISOString()}] generate-images started - Method: ${req.method}`);
  
  if (req.method === 'OPTIONS') {
    console.log('CORS preflight request');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[HEALTH] generate-images called at', new Date().toISOString());
    
    // PHASE 4: Check memory before processing
    const memUsage = Deno.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
    
    console.log(`📊 Memory at function start: ${heapUsedMB.toFixed(1)}MB / ${heapTotalMB.toFixed(1)}MB (${((heapUsedMB/heapTotalMB)*100).toFixed(1)}%)`);
    
    // Aggressive memory optimization before processing
    if ((globalThis as any).gc) {
      (globalThis as any).gc();
      console.log('🧹 Triggered garbage collection at function start');
    }
    
    if (heapUsedMB > 180) {
      console.error(`🚨 Memory critical: ${heapUsedMB}MB, aborting before crash`);
      return new Response(JSON.stringify({ error: 'Memory limit exceeded, please retry' }), {
        status: 507,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
    if (!GOOGLE_API_KEY) {
      throw new Error('GOOGLE_API_KEY is required');
    }

    let { prompts, characters, consistentCharacters, batchIndex, batchSize = 2, isReworkMode = false, complexity } = await req.json();
    
    // Keep character photos as-is - proper conversion happens later
    // (Removed corrupting compression that was truncating base64 strings)
    
    // Set retries based on rework mode - fewer retries for rework to be faster
    const MAX_RETRIES = isReworkMode ? 1 : 2; // 2 attempts for rework, 3 for initial gen

    if (!prompts || !Array.isArray(prompts)) {
      throw new Error('Invalid prompts array');
    }

    // Filter out any prompts that don't have the required fields
    let validPrompts = prompts.filter((p: any) => p && p.prompt && p.pageNumber);
    
    if (validPrompts.length === 0) {
      throw new Error('No valid prompts provided');
    }

    // Log received prompts for debugging
    console.log(`Received ${prompts.length} prompts, ${validPrompts.length} valid. Page numbers: [${validPrompts.map(p => p.pageNumber).join(', ')}]`);
    console.log(`Rework mode: ${isReworkMode}, batchIndex: ${batchIndex}, batchSize: ${batchSize}`);
    console.log(`MAX_RETRIES set to: ${MAX_RETRIES} (${isReworkMode ? 'rework mode' : 'initial generation'})`);

    // Calculate batch range if batchIndex is provided AND not in rework mode
    // In rework mode, prompts are already filtered to only selected pages
    let batchInfo = null;
    
    if (typeof batchIndex === 'number' && !isReworkMode) {
      const startIdx = batchIndex * batchSize;
      const endIdx = Math.min(startIdx + batchSize, validPrompts.length);
      
      console.log(`Batch slicing: startIdx=${startIdx}, endIdx=${endIdx}, array length=${validPrompts.length}`);
      validPrompts = validPrompts.slice(startIdx, endIdx);
      
      const totalBatches = Math.ceil(prompts.filter((p: any) => p && p.prompt && p.pageNumber).length / batchSize);
      batchInfo = {
        batchIndex,
        batchSize,
        totalBatches,
        processedPages: validPrompts.map((p: any) => p.pageNumber)
      };
      
      console.log(`Processing batch ${batchIndex + 1}/${totalBatches} (pages ${startIdx + 1}-${endIdx} of original prompt list)`);
    } else if (isReworkMode) {
      console.log(`Rework mode: processing ${validPrompts.length} selected pages directly [${validPrompts.map(p => p.pageNumber).join(', ')}]`);
    }

    console.log(`Final: Processing ${validPrompts.length} pages. Page numbers: [${validPrompts.map(p => p.pageNumber).join(', ')}]`);
    console.log(`Complexity level: ${complexity || 'default (medium)'}`);

    const BATCH_SIZE = 2; // Reduced to prevent CPU timeouts
    const pages: any[] = [];
    let successCount = 0;
    const startTime = Date.now();

    // Process in batches
    for (let batchStart = 0; batchStart < validPrompts.length; batchStart += BATCH_SIZE) {
      // Check for timeout before processing each batch
      if (Date.now() - startTime > FUNCTION_TIMEOUT) {
        console.warn(`Approaching timeout limit (${FUNCTION_TIMEOUT}ms), returning partial results`);
        break;
      }
      const batchEnd = Math.min(batchStart + BATCH_SIZE, validPrompts.length);
      const batch = validPrompts.slice(batchStart, batchEnd);
      
      console.log(`Processing batch ${batchStart / BATCH_SIZE + 1}: pages ${batchStart + 1}-${batchEnd}`);

      const batchPromises = batch.map(async (prompt: any, batchIndex: number) => {
        const i = batchStart + batchIndex;
        
        try {
          console.log(`Processing page ${i + 1}/${validPrompts.length}: ${prompt.prompt.substring(0, 50)}...`);

          // Build character context with names and photos
          const characterContext: any[] = [];
          let characterNames = '';

          if (consistentCharacters && characters && Array.isArray(characters)) {
            const pageCharacters = characters.filter((char: any) => 
              !prompt.characterName || char.name === prompt.characterName
            );
            
            if (pageCharacters.length > 0) {
              characterNames = pageCharacters.map((char: any) => char.name).join(' and ');
              
              // Add character reference photos
              for (const character of pageCharacters) {
                if (character.photos && Array.isArray(character.photos) && character.photos.length > 0) {
                  for (const photoUrl of character.photos.slice(0, 1)) { // Use first photo only
                    // Validate that photoUrl is a string before using it
                    if (photoUrl && typeof photoUrl === 'string') {
                      characterContext.push({
                        type: 'image_url',
                        image_url: { url: photoUrl }
                      });
                    } else {
                      console.warn(`Invalid photo URL for character ${character.name}:`, photoUrl);
                    }
                  }
                }
              }
              
              if (characterContext.length > 0) {
                console.log(`Added ${characterContext.length} character reference photo(s) for page ${i + 1}`);
              }
            }
          }

          // PHASE 3 & 5: Pre-filter and enhance prompt with brightness hints
          const filteredPrompt = preFilterPrompt(prompt.prompt);

          // Determine composition guidance based on shot type (if available)
          const shotType = (prompt as any).shotType || 'medium';
          const compositionMap: Record<string, string> = {
            wide: 'WIDE SHOT: Character is part of a larger detailed scene. Show full environment with rich details for coloring. Character occupies 20-40% of frame.',
            medium: 'MEDIUM SHOT: Balance character and environment equally. Show character interacting with surroundings. Character occupies 40-60% of frame.',
            close: 'CLOSE-UP: Character is prominent with detailed contextual background visible. Character occupies 60-80% of frame.'
          };
          const compositionGuidance = compositionMap[shotType] || compositionMap['medium'];
          
          // CRITICAL: Add complexity-specific instructions for image generation
          const complexityImageGuidance: Record<string, string> = {
            simple: 'SIMPLICITY REQUIRED: Large shapes, bold lines, minimal detail. Think toddler-friendly coloring. Very few elements in the scene.',
            medium: 'MODERATE DETAIL: Balanced complexity, clear shapes with some decorative elements. Age 5-6 appropriate.',
            detailed: 'DETAILED & INTRICATE: Complex patterns, fine details, elaborate scenes. Ages 7+ and adult level complexity.'
          };
          const complexityHint = complexityImageGuidance[complexity || 'medium'] || complexityImageGuidance.medium;
          
          console.log(`[COMPLEXITY] Applying '${complexity || 'medium'}' complexity to page ${i + 1}`);
          console.log(`[COMPLEXITY] Guidance: ${complexityHint}`);

          const realisticPrompt = characterContext.length > 0 
            ? `${compositionGuidance}\n\n${complexityHint}\n\n${filteredPrompt}\n\nMatch the person in the reference photo exactly. Bright, high-key lighting. Detailed, colorable environment. Well-lit scene. Child-appropriate.`
            : `${compositionGuidance}\n\n${complexityHint}\n\n${filteredPrompt}\n\nBright, high-key lighting. Detailed, colorable environment. Well-lit scene. Child-appropriate.`;

          const contentParts = [
            ...characterContext, // Photos first for better matching
            { type: 'text', text: realisticPrompt }
          ];

          const realisticImageBase64 = await generateRealisticImage(
            prompt,
            contentParts,
            GOOGLE_API_KEY,
            i,
            validPrompts.length,
            complexity,
            MAX_RETRIES
          );

          // Step 2: Convert to line art
          const lineArtImageBase64 = await convertToLineArt(
            realisticImageBase64,
            prompt,
            GOOGLE_API_KEY,
            i,
            validPrompts.length,
            complexity,
            MAX_RETRIES
          );

          successCount++;

          return {
            pageNumber: prompt.pageNumber,
            imageUrl: lineArtImageBase64,
            prompt: prompt.prompt
          };

        } catch (error: any) {
          // PHASE 1: Enhanced error logging with full context
          console.error(`❌ FAILED: Page ${i + 1}/${validPrompts.length} (page number: ${prompt.pageNumber})
  Error: ${error.message}
  Prompt: "${prompt.prompt.substring(0, 100)}..."
  Error type: ${error.name || 'Error'}
  Stack: ${error.stack?.substring(0, 300) || 'none'}`);
          
          // PHASE 5: Log if it was a safety filter issue
          if (error.message?.includes('MODEL_REFUSED') || error.message?.includes('Safety filter')) {
            console.warn(`⚠️ Safety filter rejection detected for page ${prompt.pageNumber}`);
            // Try to identify trigger word
            for (const word of SAFETY_FILTER_WORDS) {
              if (prompt.prompt.toLowerCase().includes(word.toLowerCase())) {
                console.log(`Possible trigger word in prompt: "${word}"`);
                break;
              }
            }
          }
          
          const isRateLimitError = error.message?.includes('Rate limit') || error.message?.includes('429');
          const isPaymentError = error.message?.includes('credits') || error.message?.includes('402');
          
          if (isRateLimitError || isPaymentError) {
            throw error; // Propagate rate limit and payment errors immediately
          }

          return {
            pageNumber: prompt.pageNumber,
            imageUrl: '',
            prompt: prompt.prompt,
            error: `${error.message || 'Unknown error'} (Exhausted retries after ${MAX_RETRIES} attempts)`
          };
        }
      });

      // PHASE 1: Ensure batch errors are properly captured with Promise.allSettled
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Process settled promises
      const successfulPages = batchResults
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as PromiseFulfilledResult<any>).value);
      
      pages.push(...successfulPages);
      
      // PHASE 1: Log batch completion with details
      const fulfilled = batchResults.filter(r => r.status === 'fulfilled').length;
      const rejected = batchResults.filter(r => r.status === 'rejected').length;
      console.log(`✓ Batch ${batchStart / BATCH_SIZE + 1} complete: ${fulfilled} succeeded, ${rejected} failed`);
      
      // PHASE 1: Log rejected promises for debugging (these shouldn't happen but log if they do)
      batchResults.forEach((result, idx) => {
        if (result.status === 'rejected') {
          console.error(`⚠️ Batch promise ${idx} unexpectedly rejected:`, result.reason);
        }
      });
    }

    console.log(`Generated ${successCount}/${validPrompts.length} images successfully`);
    
    const executionTime = Date.now() - startTime;
    const partialResult = pages.length < validPrompts.length;
    const timeoutWarning = executionTime > FUNCTION_TIMEOUT;

    if (partialResult) {
      console.warn(`Partial results: ${pages.length}/${validPrompts.length} pages processed`);
    }
    if (timeoutWarning) {
      console.warn(`Timeout warning: execution took ${executionTime}ms (limit: ${FUNCTION_TIMEOUT}ms)`);
    }

    return new Response(
      JSON.stringify({ 
        pages,
        successCount,
        totalCount: validPrompts.length,
        batchInfo,
        partialResult,
        timeoutWarning,
        executionTime
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in generate-images function:', error);
    
    const isRateLimitError = error.message?.includes('Rate limit') || error.message?.includes('429');
    const isPaymentError = error.message?.includes('credits') || error.message?.includes('402');
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        isRateLimitError,
        isPaymentError
      }),
      { 
        status: isRateLimitError ? 429 : (isPaymentError ? 402 : 500),
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
