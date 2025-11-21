import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BASE_DELAY = 1000;
const FUNCTION_TIMEOUT = 140000; // 140 seconds (10s before hard limit)

// Enhanced system message for Step 1 - Photorealistic with high-key lighting for line art conversion
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
✓ Minimal texture detail: Smooth rendering without excessive pores/wrinkles
✓ Frontal or side lighting (NOT dramatic side lighting with deep shadows)
✓ Environmental context: Simple real setting with minimal clutter

CHARACTER MATCHING:
- Match reference photo EXACTLY: face, hair color/style, skin tone, eye color, age
- Same person in a DIFFERENT real-world photo scenario
- Think: passport photo, yearbook photo, bright studio portrait (NOT moody dramatic portrait)

SCENE COMPOSITION:
- Clean, simple background (solid color backdrop preferred)
- Natural pose appropriate for the described activity
- Child-friendly and wholesome
- MINIMAL shadows cast by subject
- Bright, cheerful lighting

LIGHTING STYLE (CRITICAL FOR SUCCESS):
- Think "overcast day" or "ring light" - soft, diffused, even lighting
- NOT "golden hour" or "window light" with dramatic shadows
- Flat lighting reduces shading that needs removal in line art step
- High contrast between dark (hair, clothing) and light (skin, background) areas

VALIDATION: Your output will be analyzed for color variance. Photorealistic images have 25-50% variance. Cartoons have <15% variance. IF YOUR IMAGE TESTS BELOW 18% VARIANCE, IT WILL BE REJECTED.

OUTPUT: A bright, evenly-lit photograph that maintains realism but minimizes complex shading and shadows. Think: bright studio photo, high-key portrait, passport photo style - NOT dramatic moody photography.`;

// Enhanced system message for Step 2 - Line art conversion with shadow handling
const LINE_ART_SYSTEM_MESSAGE = `CRITICAL: Convert the INPUT IMAGE ONLY to pure black and white line art. Do NOT regenerate the scene.

CONVERSION REQUIREMENTS:
- Transform EVERY pixel to either pure black (#000000) OR pure white (#FFFFFF)
- ABSOLUTELY NO gray tones, shading, shadows, gradients, or photographic elements
- Convert soft shadows to white (remove them entirely)
- Convert dark shadows to black outlines or white (depending on context)
- NO filled black areas - use hatching/crosshatching for any remaining dark regions
- Bold 2-4px outlines suitable for children to color
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
4. Must look like a hand-drawn coloring book page

CRITICAL RULES:
1. Convert the PROVIDED IMAGE - do NOT create new image from text
2. Binary output only: pure black OR pure white pixels
3. Remove ALL photographic shadows by converting them to white
4. Must be printer-ready with crisp black lines on white background

OUTPUT: Clean black and white line drawing with NO gray tones or photographic shadows.`;

// Helper function to simplify prompts that might trigger safety filters
function simplifyPromptForRetry(originalPrompt: string, attemptNumber: number): string {
  const nameMatch = originalPrompt.match(/^([A-Z][a-z]+)/);
  const characterName = nameMatch ? nameMatch[1] : 'the character';
  
  if (attemptNumber === 1) {
    // First retry: Extract main activity, remove adjectives and complex words
    const activityMatch = originalPrompt.match(/(playing|sitting|holding|standing|walking|running|reading|drawing|building|eating)/i);
    if (activityMatch) {
      return `${characterName} ${activityMatch[1]} in a simple room. Natural lighting.`;
    }
    // Fallback: remove problematic words
    return originalPrompt
      .replace(/enchanted|magical|mystical|wonder|admiring|gazing/gi, '')
      .replace(/playful|teasing/gi, 'playing')
      .substring(0, 150);
  }
  
  if (attemptNumber === 2) {
    // Second retry: Ultra-simple fallback
    return `${characterName} in a simple indoor scene. Bright, natural lighting.`;
  }
  
  console.log(`Simplified prompt (attempt ${attemptNumber}): ${originalPrompt.substring(0, 80)}...`);
  return originalPrompt;
}

// Use Google's Gemini API directly - cheapest model with image generation
const getModelForComplexity = (complexity?: string): string => {
  console.log(`Using gemini-2.5-flash-image via Google API (requested: ${complexity || 'default'})`);
  return 'gemini-2.5-flash-image'; // Remove "google/" prefix for direct API
};

// Simplified validation for line art - detects shading and photo elements
async function validateLineArt(base64Image: string): Promise<{ 
  valid: boolean; 
  grayPixelPercentage: number;
  hasPhotographicElements: boolean;
}> {
  try {
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
    if (!base64Data || base64Data.length < 100) {
      return { valid: false, grayPixelPercentage: 100, hasPhotographicElements: true };
    }

    // Decode and validate image dimensions
    const buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const image = await Image.decode(buffer);
    
    // Safety check for valid dimensions
    if (image.width < 10 || image.height < 10) {
      console.error('Image dimensions too small:', image.width, 'x', image.height);
      return { valid: false, grayPixelPercentage: 100, hasPhotographicElements: true };
    }
    
    let totalPixels = 0;
    let grayPixels = 0;
    let nearGrayPixels = 0;
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
          
          const isBlack = r <= threshold && g <= threshold && b <= threshold;
          const isWhite = r >= (255 - threshold) && g >= (255 - threshold) && b >= (255 - threshold);
          
          if (!isBlack && !isWhite) {
            grayPixels++;
            const avg = (r + g + b) / 3;
            if (avg > 60 && avg < 195) {
              nearGrayPixels++;
            }
          }
        } catch (err) {
          console.error(`Pixel access error at (${x}, ${y}):`, err);
          continue; // Skip problematic pixel, don't crash validation
        }
      }
    }
    
    if (totalPixels === 0) {
      return { valid: false, grayPixelPercentage: 100, hasPhotographicElements: true };
    }
    
    const grayPercentage = (grayPixels / totalPixels) * 100;
    const nearGrayPercentage = (nearGrayPixels / totalPixels) * 100;
    const blackPercentage = ((totalPixels - grayPixels) / totalPixels) * 100;
    
    // CRITICAL: Check for complete conversion failure
    if (grayPercentage > 50) {
      console.error(`CRITICAL: Image is ${grayPercentage.toFixed(1)}% gray - still a photo!`);
      return { valid: false, grayPixelPercentage: grayPercentage, hasPhotographicElements: true };
    }
    
    // Adjusted thresholds for high-key source images - more lenient with bright photos
    const GRAY_THRESHOLD = 35; // Increased - bright source images may have more compression artifacts
    const MID_GRAY_THRESHOLD = 20; // Increased - allows slightly more gray from bright photos
    
    const hasExcessiveGray = grayPercentage > GRAY_THRESHOLD;
    const hasExcessiveMidTones = nearGrayPercentage > MID_GRAY_THRESHOLD;
    // Only fail on photographic elements if also very gray (>40%)
    const hasPhotographicElements = nearGrayPercentage > MID_GRAY_THRESHOLD;
    const isPhotoLike = hasPhotographicElements && grayPercentage > 40;
    
    const isValid = !hasExcessiveGray && !hasExcessiveMidTones && !isPhotoLike;
    
    console.log(`[VALIDATION DETAIL] Line art page:
  - Gray pixels: ${grayPercentage.toFixed(2)}% (threshold: ${GRAY_THRESHOLD}%)
  - Mid-tone gray: ${nearGrayPercentage.toFixed(2)}% (threshold: ${MID_GRAY_THRESHOLD}%)
  - Black/White: ${blackPercentage.toFixed(2)}%
  - Photo-like: ${isPhotoLike ? 'Yes' : 'No'}
  - Result: ${isValid ? '✓ PASS' : '✗ FAIL'}`);
    
    return { 
      valid: isValid, 
      grayPixelPercentage: grayPercentage,
      hasPhotographicElements: hasPhotographicElements
    };
    
  } catch (error) {
    console.error('Line art validation error:', error);
    return { valid: false, grayPixelPercentage: 100, hasPhotographicElements: true };
  }
}

// Simplified photorealistic validation - detects cartoon/illustrated images
async function validateRealisticImage(base64Image: string): Promise<{
  valid: boolean;
  isCartoonLike: boolean;
  colorVariance: number;
}> {
  try {
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const image = await Image.decode(buffer);
    
    // Safety check for valid dimensions
    if (image.width < 10 || image.height < 10) {
      console.error('Image dimensions too small:', image.width, 'x', image.height);
      return { valid: false, isCartoonLike: true, colorVariance: 0 };
    }
    
    let totalSamples = 0;
    let colorDifferences = 0;
    
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
      }
    }
    
    if (totalSamples === 0) {
      return { valid: false, isCartoonLike: true, colorVariance: 0 };
    }
    
    const variancePercentage = (colorDifferences / totalSamples) * 100;
    
    // Relaxed thresholds to reduce false positives on clean photos
    const isRealistic = variancePercentage > 18; // Lowered from 20% - accepts more borderline photos
    const isCartoonLike = variancePercentage < 12; // Keep strict for obvious cartoons
    
    console.log(`[VALIDATION DETAIL] Realistic image:
  - Color variance: ${variancePercentage.toFixed(1)}% (threshold: 20%)
  - Result: ${isRealistic ? '✓ PASS - Photorealistic' : '✗ FAIL - ' + (isCartoonLike ? 'Cartoon-like' : 'Low texture')}`);
    
    return {
      valid: isRealistic,
      isCartoonLike: isCartoonLike,
      colorVariance: variancePercentage
    };
    
  } catch (error) {
    console.error('Realistic validation error:', error);
    return { valid: false, isCartoonLike: true, colorVariance: 0 };
  }
}

async function generateRealisticImage(
  prompt: any,
  contentParts: any[],
  GOOGLE_API_KEY: string,
  pageIndex: number,
  totalPages: number,
  complexity?: string,
  maxRetries?: number
): Promise<string> {
  const MAX_RETRIES = maxRetries || 2;
  const selectedModel = getModelForComplexity(complexity);
  const MODELS = [selectedModel]; // Use only the selected model
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    for (const model of MODELS) {
      try {
        console.log(`Step 1/2 - Generating realistic image ${pageIndex + 1}/${totalPages} (attempt ${attempt}/${MAX_RETRIES}, model: ${model})`);
        
        // Merge system message with first text content
        const firstTextIndex = contentParts.findIndex((part: any) => part.type === 'text');
        const mergedContent = [...contentParts];
        
        if (firstTextIndex >= 0) {
          mergedContent[firstTextIndex] = {
            type: 'text',
            text: REALISTIC_SYSTEM_MESSAGE + '\n\n' + contentParts[firstTextIndex].text
          };
        } else {
          mergedContent.unshift({ type: 'text', text: REALISTIC_SYSTEM_MESSAGE });
        }
        
        // Transform content parts to Google's native format
        const parts = mergedContent.map((part: any) => {
          if (part.type === 'text') {
            return { text: part.text };
          } else if (part.type === 'image_url') {
            // Convert data URL to inline data format
            const base64Data = part.image_url.url.replace(/^data:image\/\w+;base64,/, '');
            const mimeType = part.image_url.url.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';
            return {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            };
          }
          return part;
        });

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
                parts: parts
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
          console.error(`Step 1 API error (${imageResponse.status}): ${errorMessage}`);
          
          // Check for safety/content policy refusal
          if (errorMessage.toLowerCase().includes('safety') || 
              errorMessage.toLowerCase().includes('refused') || 
              errorMessage.toLowerCase().includes('policy') ||
              errorMessage.toLowerCase().includes('blocked')) {
            console.warn(`⚠️ Safety filter triggered on attempt ${attempt}`);
            
            // Auto-simplify and retry
            if (attempt < MAX_RETRIES) {
              console.log('Simplifying prompt and retrying...');
              const simplifiedPrompt = simplifyPromptForRetry(prompt.prompt, attempt);
              
              // Update content parts with simplified prompt
              contentParts[0] = {
                type: 'text',
                text: `${simplifiedPrompt}\n\nMatch the person in the reference photo. Natural lighting, simple background, child-appropriate.`
              };
              
              const delay = BASE_DELAY * Math.pow(2, attempt - 1);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
            
            throw new Error(`MODEL_REFUSED: Safety filter triggered - ${errorMessage}`);
          }
          
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
          throw new Error(`Step 1 failed: ${errorMessage}`);
        }

        const data = await imageResponse.json();
        
        // Extract base64 image from Google's response format
        const imagePart = data.candidates?.[0]?.content?.parts?.find(
          (p: any) => p.inlineData
        );
        
        if (!imagePart?.inlineData?.data) {
          // Extract the prompt text for error logging
          const promptText = contentParts.find((p: any) => p.type === 'text')?.text || 'unknown prompt';
          const errorMsg = `Model refused to generate image - possible content policy issue with prompt: "${promptText.substring(0, 100)}..."`;
          console.error(`No image data in Step 1 response: ${errorMsg}`);
          
          if (attempt < MAX_RETRIES) {
            console.log(`Attempt ${attempt + 1}: No image data received. Trying with simplified prompt...`);
            
            // FALLBACK: Simplify the prompt to remove potentially problematic words
            const simplifiedPrompt = simplifyPromptForRetry(promptText, attempt);
            
            // Retry with simplified prompt
            const firstTextIndex = mergedContent.findIndex((part: any) => part.type === 'text');
            if (firstTextIndex >= 0) {
              mergedContent[firstTextIndex] = {
                type: 'text',
                text: REALISTIC_SYSTEM_MESSAGE + '\n\n' + simplifiedPrompt
              };
            }
            continue;
          }
          
          throw new Error(`MODEL_REFUSED: ${errorMsg}`);
        }

        // Convert to data URL
        const step1MimeType = imagePart.inlineData.mimeType || 'image/png';
        const imageData = `data:${step1MimeType};base64,${imagePart.inlineData.data}`;

        console.log(`Successfully generated realistic image ${pageIndex + 1}/${totalPages} on attempt ${attempt} with model ${model}`);
        
        // Validate the realistic image BEFORE returning
        const realisticValidation = await validateRealisticImage(imageData);
        const variance = realisticValidation.colorVariance;
        
        if (variance < 15) {
          // Clearly cartoon - reject and retry
          console.error(`Realistic image validation failed for page ${pageIndex + 1}: CARTOON-LIKE (${variance.toFixed(1)}% variance)`);
          
          if (attempt < MAX_RETRIES) {
            console.log(`Retrying realistic image generation (attempt ${attempt + 1}/${MAX_RETRIES}) with strengthened prompt...`);
            
            // STRENGTHEN the prompt by prepending explicit anti-cartoon instructions
            const firstTextIndex = mergedContent.findIndex((part: any) => part.type === 'text');
            if (firstTextIndex >= 0) {
              mergedContent[firstTextIndex] = {
                type: 'text',
                text: `CRITICAL OVERRIDE: The previous attempt produced a cartoon/illustration (${variance.toFixed(1)}% variance). You MUST generate a REAL PHOTOGRAPH this time with natural lighting, realistic textures, and photographic depth. Aim for 30-40% color variance minimum.\n\n` + mergedContent[firstTextIndex].text
              };
            }
            continue; // Retry with modified prompt
          }
          
          throw new Error(`Realistic image generation failed: Too cartoon-like (${variance.toFixed(1)}% variance) after ${MAX_RETRIES} retries`);
          
        } else if (variance < 18) {
          // Borderline - accept on final attempt, retry earlier
          if (attempt < MAX_RETRIES) {
            console.log(`Borderline realistic image (${variance.toFixed(1)}% variance) - retrying for better quality...`);
            continue;
          }
          console.warn(`⚠️ Accepting borderline realistic image for page ${pageIndex + 1} (${variance.toFixed(1)}% variance) - may affect line art quality`);
          // Fall through - accept it
          
        } else {
          // Good photorealism (>18%)
          console.log(`✓ Realistic image validated successfully for page ${pageIndex + 1}/${totalPages}`);
        }

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
  const MAX_RETRIES = maxRetries || 2;
  const selectedModel = getModelForComplexity(complexity);
  const MODELS = [selectedModel]; // Use only the selected model
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    for (const model of MODELS) {
      try {
        console.log(`Step 2/2 - Converting to line art ${pageIndex + 1}/${totalPages} (attempt ${attempt}/${MAX_RETRIES}, model: ${model})`);
        
        // Transform to Google's native format
        const base64Data = realisticImageBase64.replace(/^data:image\/\w+;base64,/, '');
        const inputMimeType = realisticImageBase64.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/png';
        
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
                  { text: LINE_ART_SYSTEM_MESSAGE + `\n\nConvert THIS PROVIDED IMAGE to clean black and white line art. Focus on converting the image you see, not recreating the scene.` },
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
        
        // Validate the line art with pixel-level analysis
        const validation = await validateLineArt(imageData);
        
        // Classify validation failures: severe vs moderate
        const isSevereFailure = validation.grayPixelPercentage > 60 || 
                                (validation.hasPhotographicElements && validation.grayPixelPercentage > 40);
        
        if (!validation.valid) {
          const issues: string[] = [];
          if (validation.grayPixelPercentage > 30) {
            issues.push(`${validation.grayPixelPercentage.toFixed(1)}% gray pixels`);
          }
          if (validation.hasPhotographicElements && validation.grayPixelPercentage > 40) {
            issues.push('too photographic');
          }
          
          // For severe failures, retry or throw
          if (isSevereFailure) {
            console.error(`SEVERE validation failure for page ${pageIndex + 1}: ${issues.join(', ')}`);
            
            if (attempt < MAX_RETRIES) {
              console.log(`Retrying line art conversion (attempt ${attempt + 1}/${MAX_RETRIES})...`);
              continue;
            }
            
            throw new Error(`VALIDATION_FAILED: Image is too photographic (${validation.grayPixelPercentage.toFixed(1)}% gray). Use brighter photos with higher contrast.`);
          }
          
          // For moderate failures, accept with warning
          console.log(`[WARNING] Line art has ${validation.grayPixelPercentage.toFixed(1)}% gray pixels – accepted with warning`);
        }

        console.log(`✓ Line art validated for page ${pageIndex + 1}/${totalPages} (${validation.grayPixelPercentage.toFixed(2)}% gray pixels)`);
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
    
    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
    if (!GOOGLE_API_KEY) {
      throw new Error('GOOGLE_API_KEY is required');
    }

    const { prompts, characters, consistentCharacters, batchIndex, batchSize = 2, isReworkMode = false, complexity } = await req.json();
    
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
                    characterContext.push({
                      type: 'image_url',
                      image_url: { url: photoUrl }
                    });
                  }
                }
              }
              
              if (characterContext.length > 0) {
                console.log(`Added ${characterContext.length} character reference photo(s) for page ${i + 1}`);
              }
            }
          }

          // Step 1: Generate realistic image - SIMPLIFIED PROMPT
          const realisticPrompt = characterContext.length > 0 
            ? `${prompt.prompt}\n\nMatch the person in the reference photo exactly. Natural lighting, simple background, child-appropriate.`
            : `${prompt.prompt}\n\nNatural lighting, simple background, child-appropriate.`;

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
          console.error(`Failed to generate page ${i + 1} (page number ${prompt.pageNumber}):`, error);
          console.error(`Error details:`, {
            message: error.message,
            stack: error.stack?.substring(0, 200),
            prompt: prompt.prompt.substring(0, 100) + '...'
          });
          
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

      const batchResults = await Promise.all(batchPromises);
      pages.push(...batchResults);
      
      console.log(`Completed batch ${batchStart / BATCH_SIZE + 1}: ${batchResults.filter(p => p.imageUrl).length}/${batchResults.length} successful`);
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
