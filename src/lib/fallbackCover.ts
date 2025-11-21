/**
 * Generates simple, guaranteed fallback covers when AI generation fails.
 * Uses canvas to create basic but printable covers.
 */

export async function generateFallbackCovers(
  characterName: string,
  samplePageImageUrl?: string
): Promise<{ front: string; back: string }> {
  console.log('Generating fallback covers for:', characterName);

  // Create front cover
  const frontCover = await createFrontCover(characterName, samplePageImageUrl);
  
  // Create back cover
  const backCover = await createBackCover(characterName);

  return {
    front: frontCover,
    back: backCover
  };
}

async function createFrontCover(characterName: string, sampleImageUrl?: string): Promise<string> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Set dimensions for print quality (8.5x11 inches at 300 DPI)
  const width = 2550;
  const height = 3300;
  canvas.width = width;
  canvas.height = height;

  // Pastel background gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#E0E7FF');  // Light indigo
  gradient.addColorStop(1, '#FEF3C7');  // Light amber
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Add decorative border
  ctx.strokeStyle = '#6366F1';
  ctx.lineWidth = 20;
  ctx.strokeRect(80, 80, width - 160, height - 160);

  // Title text
  ctx.fillStyle = '#4338CA';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Main title
  ctx.font = 'bold 180px Arial, sans-serif';
  const titleLines = wrapText(ctx, `${characterName}'s`, width - 300, 150);
  let yPos = height * 0.25;
  titleLines.forEach(line => {
    ctx.fillText(line, width / 2, yPos);
    yPos += 200;
  });

  // Subtitle
  ctx.font = 'bold 140px Arial, sans-serif';
  ctx.fillText('Coloring Book', width / 2, yPos + 100);

  // Add sample image if provided
  if (sampleImageUrl) {
    try {
      const img = await loadImage(sampleImageUrl);
      const maxSize = 600;
      const aspectRatio = img.width / img.height;
      let imgWidth = maxSize;
      let imgHeight = maxSize;
      
      if (aspectRatio > 1) {
        imgHeight = maxSize / aspectRatio;
      } else {
        imgWidth = maxSize * aspectRatio;
      }
      
      const imgX = (width - imgWidth) / 2;
      const imgY = height - imgHeight - 300;
      
      // Draw white background for image
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(imgX - 20, imgY - 20, imgWidth + 40, imgHeight + 40);
      
      ctx.drawImage(img, imgX, imgY, imgWidth, imgHeight);
    } catch (error) {
      console.warn('Failed to load sample image for fallback cover:', error);
    }
  }

  return canvas.toDataURL('image/png', 1.0);
}

async function createBackCover(characterName: string): Promise<string> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Set dimensions for print quality
  const width = 2550;
  const height = 3300;
  canvas.width = width;
  canvas.height = height;

  // Matching pastel background gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#FEF3C7');  // Light amber
  gradient.addColorStop(1, '#E0E7FF');  // Light indigo
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Decorative border
  ctx.strokeStyle = '#6366F1';
  ctx.lineWidth = 20;
  ctx.strokeRect(80, 80, width - 160, height - 160);

  // Back cover text
  ctx.fillStyle = '#4338CA';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 100px Arial, sans-serif';
  
  ctx.fillText('Hours of Fun!', width / 2, height / 2 - 200);
  ctx.font = '80px Arial, sans-serif';
  ctx.fillText(`Created especially for ${characterName}`, width / 2, height / 2);

  return canvas.toDataURL('image/png', 1.0);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, lineHeight: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + ' ' + word).width;
    if (width < maxWidth) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
