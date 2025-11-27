/**
 * UK PDF Configuration for A4 format books
 * 
 * A4 dimensions: 210mm x 297mm
 * This is for the UK Christmas launch system
 */

export const UK_PDF_CONFIG = {
  // A4 dimensions in millimeters
  PAGE_WIDTH_MM: 210,
  PAGE_HEIGHT_MM: 297,
  
  // Convert to inches for jsPDF (1 inch = 25.4mm)
  PAGE_WIDTH_INCHES: 8.27, // 210mm / 25.4
  PAGE_HEIGHT_INCHES: 11.69, // 297mm / 25.4
  
  // Margins in millimeters
  MARGIN_MM: 10,
  MARGIN_INCHES: 0.394, // 10mm / 25.4
  
  // Resolution settings
  DPI: 300,
  POINTS_PER_INCH: 72, // PDF points per inch
  
  // Page counts for UK system
  COLORING_PAGES: 18, // Interior coloring pages
  TOTAL_PAGES: 20, // 18 coloring + 1 front cover + 1 back cover
  
  // Cover colors (soft, modern palette)
  COVER_BACKGROUND: '#e0e7ff', // Soft lavender
  COVER_TEXT_PRIMARY: '#1e293b', // Dark blue-gray
  COVER_TEXT_SECONDARY: '#475569', // Medium blue-gray
  COVER_ACCENT: '#7c3aed', // Purple accent
  
  // Typography
  COVER_TITLE_SIZE: 32,
  COVER_SUBTITLE_SIZE: 18,
  COVER_FOOTER_SIZE: 12,
  BACK_COVER_TITLE_SIZE: 28,
  BACK_COVER_TEXT_SIZE: 14,
} as const;

/**
 * Calculate content area dimensions in inches after accounting for margins
 */
export function getUKContentArea() {
  return {
    width: UK_PDF_CONFIG.PAGE_WIDTH_INCHES - (UK_PDF_CONFIG.MARGIN_INCHES * 2),
    height: UK_PDF_CONFIG.PAGE_HEIGHT_INCHES - (UK_PDF_CONFIG.MARGIN_INCHES * 2),
    left: UK_PDF_CONFIG.MARGIN_INCHES,
    top: UK_PDF_CONFIG.MARGIN_INCHES,
  };
}

/**
 * Convert millimeters to points (for jsPDF)
 */
export function mmToPoints(mm: number): number {
  return (mm / 25.4) * UK_PDF_CONFIG.POINTS_PER_INCH;
}

/**
 * Convert inches to points (for jsPDF)
 */
export function inchesToPoints(inches: number): number {
  return inches * UK_PDF_CONFIG.POINTS_PER_INCH;
}
