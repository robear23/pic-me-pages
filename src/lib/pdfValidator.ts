import jsPDF from 'jspdf';
import { LULU_CONFIG } from './luluConfig';

export interface PDFValidationResult {
  valid: boolean;
  dimensions: {
    width: number;
    height: number;
    widthInches: number;
    heightInches: number;
  };
  expectedDimensions: {
    width: number;
    height: number;
    widthInches: number;
    heightInches: number;
  };
  errors: string[];
  warnings: string[];
  info: string[];
}

/**
 * Validate PDF dimensions against Lulu specifications
 * @param pdfUrl - URL to the PDF file or data URL
 * @param type - 'interior' or 'cover'
 */
export async function validatePdfDimensions(
  pdfUrl: string,
  type: 'interior' | 'cover'
): Promise<PDFValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  try {
    // Load the PDF to extract dimensions
    const response = await fetch(pdfUrl);
    const arrayBuffer = await response.arrayBuffer();
    const pdfData = new Uint8Array(arrayBuffer);

    // Parse PDF to get page dimensions
    // Note: This is a simplified approach - in production, you'd use a proper PDF parser
    const dimensions = await extractPdfDimensions(pdfData);

    const expectedDimensions = type === 'interior'
      ? {
          widthInches: LULU_CONFIG.PAGE_WIDTH,
          heightInches: LULU_CONFIG.PAGE_HEIGHT,
          width: LULU_CONFIG.PAGE_WIDTH * 72, // Convert to points (72 points per inch)
          height: LULU_CONFIG.PAGE_HEIGHT * 72,
        }
      : {
          widthInches: LULU_CONFIG.COVER_WIDTH,
          heightInches: LULU_CONFIG.COVER_HEIGHT,
          width: LULU_CONFIG.COVER_WIDTH * 72,
          height: LULU_CONFIG.COVER_HEIGHT * 72,
        };

    // Validate dimensions (allow 1 point tolerance for rounding)
    const tolerance = 1;
    const widthMatch = Math.abs(dimensions.width - expectedDimensions.width) <= tolerance;
    const heightMatch = Math.abs(dimensions.height - expectedDimensions.height) <= tolerance;

    if (!widthMatch) {
      errors.push(
        `Width mismatch: ${dimensions.widthInches.toFixed(3)}" (expected ${expectedDimensions.widthInches}")`
      );
    }

    if (!heightMatch) {
      errors.push(
        `Height mismatch: ${dimensions.heightInches.toFixed(3)}" (expected ${expectedDimensions.heightInches}")`
      );
    }

    // Add info about specifications
    if (type === 'interior') {
      info.push(`Bleed: ${LULU_CONFIG.BLEED}" on all sides`);
      info.push(`Trim size: ${LULU_CONFIG.TRIM_WIDTH}" x ${LULU_CONFIG.TRIM_HEIGHT}"`);
      info.push(`Safety margin: ${LULU_CONFIG.SAFETY_MARGIN}" from trim edge`);
    } else {
      info.push('Cover layout: Back (left) + Front (right)');
      info.push('No spine for coil/saddle stitch bindings');
      info.push(`Bleed: ${LULU_CONFIG.BLEED}" on all outer edges`);
    }

    const valid = errors.length === 0;

    if (valid) {
      info.push('✓ All dimensions match Lulu specifications');
    }

    return {
      valid,
      dimensions,
      expectedDimensions,
      errors,
      warnings,
      info,
    };
  } catch (error: any) {
    return {
      valid: false,
      dimensions: { width: 0, height: 0, widthInches: 0, heightInches: 0 },
      expectedDimensions: { width: 0, height: 0, widthInches: 0, heightInches: 0 },
      errors: [`Failed to validate PDF: ${error.message}`],
      warnings: [],
      info: [],
    };
  }
}

/**
 * Extract dimensions from PDF binary data
 * This uses jsPDF's internal format knowledge
 */
async function extractPdfDimensions(pdfData: Uint8Array): Promise<{
  width: number;
  height: number;
  widthInches: number;
  heightInches: number;
}> {
  // Convert to string to search for MediaBox
  const pdfString = new TextDecoder('latin1').decode(pdfData);

  // Look for MediaBox definition: /MediaBox [0 0 width height]
  const mediaBoxMatch = pdfString.match(/\/MediaBox\s*\[\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*\]/);

  if (mediaBoxMatch) {
    const width = parseFloat(mediaBoxMatch[1]);
    const height = parseFloat(mediaBoxMatch[2]);

    return {
      width,
      height,
      widthInches: width / 72, // Convert points to inches
      heightInches: height / 72,
    };
  }

  throw new Error('Could not extract PDF dimensions - MediaBox not found');
}

/**
 * Generate a validation report summary
 */
export function generateValidationReport(
  results: Array<{
    config: string;
    pdfUrl?: string;
    validation?: PDFValidationResult;
  }>
): string {
  let report = 'PDF VALIDATION REPORT\n';
  report += '='.repeat(60) + '\n\n';
  report += `Generated: ${new Date().toISOString()}\n`;
  report += `Total PDFs tested: ${results.length}\n\n`;

  results.forEach((result, index) => {
    report += `\n${index + 1}. ${result.config}\n`;
    report += '-'.repeat(60) + '\n';

    if (result.validation) {
      const v = result.validation;
      report += `Status: ${v.valid ? '✓ PASS' : '✗ FAIL'}\n`;
      report += `Dimensions: ${v.dimensions.widthInches.toFixed(3)}" x ${v.dimensions.heightInches.toFixed(3)}"\n`;
      report += `Expected: ${v.expectedDimensions.widthInches}" x ${v.expectedDimensions.heightInches}"\n`;

      if (v.errors.length > 0) {
        report += `\nErrors:\n`;
        v.errors.forEach(err => report += `  ✗ ${err}\n`);
      }

      if (v.warnings.length > 0) {
        report += `\nWarnings:\n`;
        v.warnings.forEach(warn => report += `  ⚠ ${warn}\n`);
      }

      if (v.info.length > 0) {
        report += `\nInfo:\n`;
        v.info.forEach(inf => report += `  ℹ ${inf}\n`);
      }

      if (result.pdfUrl) {
        report += `\nPDF URL: ${result.pdfUrl}\n`;
      }
    } else {
      report += 'Status: Not validated\n';
    }
  });

  return report;
}
