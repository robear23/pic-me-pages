export const LULU_CONFIG = {
  // Page dimensions (inches)
  TRIM_WIDTH: 8.5,
  TRIM_HEIGHT: 11,
  BLEED: 0.125,
  
  // Calculated page dimensions with bleed
  PAGE_WIDTH: 8.75,  // 8.5 + (0.125 * 2)
  PAGE_HEIGHT: 11.25, // 11 + (0.125 * 2)
  
  // Margins
  SAFETY_MARGIN: 0.5,        // From trim edge
  GUTTER_COIL: 0.5,         // Additional for coil binding
  GUTTER_SADDLE: 0,         // No gutter for saddle stitch
  
  // Calculated content area (with bleed and safety margin)
  CONTENT_LEFT: 0.625,      // 0.125 bleed + 0.5 safety
  CONTENT_RIGHT: 8.125,     // 8.75 - 0.625
  CONTENT_TOP: 0.625,       // 0.125 bleed + 0.5 safety
  CONTENT_BOTTOM: 10.625,   // 11.25 - 0.625
  
  // Cover dimensions (NO SPINE for coil and saddle stitch)
  COVER_WIDTH: 17.25,       // (8.5 * 2) + (0.125 * 2) - NO SPINE
  COVER_HEIGHT: 11.25,      // 11 + (0.125 * 2)
  
  // Resolution
  IMAGE_DPI: 300,
  MAX_DPI: 600,
  
  // Page count requirements
  PAGE_COUNT: {
    COIL_MIN: 2,
    COIL_MAX: 470,
    SADDLE_MIN: 4,
    SADDLE_MAX: 48,
    SADDLE_DIVISOR: 4,        // Must be divisible by 4
  },
  
  // Binding types
  BINDING: {
    SADDLE_STITCH: 'SADDLE',
    COIL: 'COIL',
  },
} as const;

// Helper to determine binding type from POD package ID
export function getBindingType(podPackageId: string): 'SADDLE' | 'COIL' {
  if (podPackageId.includes('STD')) return 'SADDLE';
  if (podPackageId.includes('CO')) return 'COIL';
  throw new Error(`Unknown binding type for POD package: ${podPackageId}`);
}

// Helper to determine color mode from POD package ID
export function isColorPackage(podPackageId: string): boolean {
  return podPackageId.includes('FC'); // Full Color
}

// Validate page count for binding type
export function validatePageCount(
  pageCount: number,
  bindingType: 'SADDLE' | 'COIL'
): { valid: boolean; adjustedCount: number; message?: string } {
  if (bindingType === 'COIL') {
    if (pageCount < LULU_CONFIG.PAGE_COUNT.COIL_MIN) {
      return {
        valid: false,
        adjustedCount: LULU_CONFIG.PAGE_COUNT.COIL_MIN,
        message: `Coil binding requires minimum ${LULU_CONFIG.PAGE_COUNT.COIL_MIN} pages`,
      };
    }
    if (pageCount > LULU_CONFIG.PAGE_COUNT.COIL_MAX) {
      return {
        valid: false,
        adjustedCount: LULU_CONFIG.PAGE_COUNT.COIL_MAX,
        message: `Coil binding allows maximum ${LULU_CONFIG.PAGE_COUNT.COIL_MAX} pages`,
      };
    }
    return { valid: true, adjustedCount: pageCount };
  }
  
  // Saddle stitch
  if (pageCount < LULU_CONFIG.PAGE_COUNT.SADDLE_MIN) {
    return {
      valid: false,
      adjustedCount: LULU_CONFIG.PAGE_COUNT.SADDLE_MIN,
      message: `Saddle stitch requires minimum ${LULU_CONFIG.PAGE_COUNT.SADDLE_MIN} pages`,
    };
  }
  if (pageCount > LULU_CONFIG.PAGE_COUNT.SADDLE_MAX) {
    return {
      valid: false,
      adjustedCount: LULU_CONFIG.PAGE_COUNT.SADDLE_MAX,
      message: `Saddle stitch allows maximum ${LULU_CONFIG.PAGE_COUNT.SADDLE_MAX} pages`,
    };
  }
  
  // Must be divisible by 4
  if (pageCount % LULU_CONFIG.PAGE_COUNT.SADDLE_DIVISOR !== 0) {
    const adjusted = Math.ceil(pageCount / LULU_CONFIG.PAGE_COUNT.SADDLE_DIVISOR) * LULU_CONFIG.PAGE_COUNT.SADDLE_DIVISOR;
    return {
      valid: false,
      adjustedCount: adjusted,
      message: `Saddle stitch page count must be divisible by 4. Adjusted from ${pageCount} to ${adjusted}`,
    };
  }
  
  return { valid: true, adjustedCount: pageCount };
}
