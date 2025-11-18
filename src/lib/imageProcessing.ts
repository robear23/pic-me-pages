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

// Ensure image is exactly 300 DPI by resizing if necessary
export async function ensureImageDPI(
  imageUrl: string,
  targetWidthInches: number,
  targetHeightInches: number
): Promise<string> {
  const targetWidth = targetWidthInches * LULU_CONFIG.IMAGE_DPI;
  const targetHeight = targetHeightInches * LULU_CONFIG.IMAGE_DPI;
  
  const img = new Image();
  await new Promise((resolve) => {
    img.onload = resolve;
    img.src = imageUrl;
  });
  
  // Only resize if necessary
  if (img.naturalWidth === targetWidth && img.naturalHeight === targetHeight) {
    return imageUrl;
  }
  
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  
  return canvas.toDataURL('image/png');
}
