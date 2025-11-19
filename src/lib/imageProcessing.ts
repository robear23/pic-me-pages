import { LULU_CONFIG } from './luluConfig';

// Validate image resolution meets 300 DPI minimum
export async function validateImageResolution(
  imageUrl: string,
  targetWidthInches: number,
  targetHeightInches: number
): Promise<{ valid: boolean; actualDPI: number; message?: string }> {
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = imageUrl;
  });
  
  const requiredWidth = targetWidthInches * LULU_CONFIG.IMAGE_DPI;
  const requiredHeight = targetHeightInches * LULU_CONFIG.IMAGE_DPI;
  
  const actualWidthDPI = img.naturalWidth / targetWidthInches;
  const actualHeightDPI = img.naturalHeight / targetHeightInches;
  const actualDPI = Math.min(actualWidthDPI, actualHeightDPI);
  
  if (actualDPI < LULU_CONFIG.IMAGE_DPI) {
    return {
      valid: false,
      actualDPI,
      message: `Image resolution too low: ${Math.round(actualDPI)} DPI (need ${LULU_CONFIG.IMAGE_DPI} DPI)`,
    };
  }
  
  return { valid: true, actualDPI };
}

// Convert image to grayscale for B&W books
export async function convertToGrayscale(imageUrl: string): Promise<string> {
  const img = new Image();
  await new Promise((resolve) => {
    img.onload = resolve;
    img.src = imageUrl;
  });
  
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Convert to grayscale
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = gray;     // R
    data[i + 1] = gray; // G
    data[i + 2] = gray; // B
    // Alpha unchanged
  }
  
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

// Ensure image fills the entire content area at 300 DPI (crops if needed to prevent letterboxing)
export async function ensureImageDPI(
  imageUrl: string,
  targetWidthInches: number,
  targetHeightInches: number
): Promise<string> {
  const img = new Image();
  await new Promise((resolve) => {
    img.onload = resolve;
    img.src = imageUrl;
  });
  
  // Target dimensions at 300 DPI (FILL entire content area)
  const targetWidthPx = Math.round(targetWidthInches * LULU_CONFIG.IMAGE_DPI);
  const targetHeightPx = Math.round(targetHeightInches * LULU_CONFIG.IMAGE_DPI);
  
  // Calculate aspect ratios
  const originalAspectRatio = img.naturalWidth / img.naturalHeight;
  const targetAspectRatio = targetWidthPx / targetHeightPx;
  
  // Calculate dimensions to FILL the area (may crop, not letterbox)
  let sourceWidth, sourceHeight, sourceX, sourceY;
  
  if (originalAspectRatio > targetAspectRatio) {
    // Image is wider - crop sides, fill height
    sourceHeight = img.naturalHeight;
    sourceWidth = sourceHeight * targetAspectRatio;
    sourceX = (img.naturalWidth - sourceWidth) / 2; // Center crop
    sourceY = 0;
  } else {
    // Image is taller - crop top/bottom, fill width
    sourceWidth = img.naturalWidth;
    sourceHeight = sourceWidth / targetAspectRatio;
    sourceX = 0;
    sourceY = (img.naturalHeight - sourceHeight) / 2; // Center crop
  }
  
  // Create canvas at exact target dimensions
  const canvas = document.createElement('canvas');
  canvas.width = targetWidthPx;
  canvas.height = targetHeightPx;
  
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  // Draw the cropped/scaled image to fill entire canvas
  ctx.drawImage(
    img,
    sourceX, sourceY, sourceWidth, sourceHeight,  // Source (crop if needed)
    0, 0, targetWidthPx, targetHeightPx           // Destination (fill)
  );
  
  console.log(`[ensureImageDPI] Scaled ${img.naturalWidth}x${img.naturalHeight} → ${targetWidthPx}x${targetHeightPx} (${targetWidthInches}" x ${targetHeightInches}" @ 300 DPI)`);
  
  return canvas.toDataURL('image/png');
}
