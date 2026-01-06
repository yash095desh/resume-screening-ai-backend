import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

// -------------------------
// CONSTANTS
// -------------------------

const SUPPORTED_MIME_TYPES = {
  PDF: "application/pdf",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  DOC: "application/msword",
} as const;

const MAX_FILE_SIZE_MB = 5;

// -------------------------
// MAIN PARSER FUNCTION
// -------------------------

/**
 * Parses a resume buffer and extracts text content
 * - DOC/DOCX files are processed using Mammoth
 * - PDF files are processed using pdf-parse library
 *
 * @param file - File buffer to parse
 * @param mimeType - MIME type of the file
 * @param fileName - Optional file name for logging/API calls
 * @returns Extracted text content from the resume
 */
export async function parseResumeBuffer(
  file: Buffer,
  mimeType: string,
  fileName?: string
): Promise<string> {
  try {
    // Validate inputs
    if (!file || file.length === 0) {
      throw new Error("Empty file buffer provided");
    }

    if (!validateFileType(mimeType)) {
      throw new Error(`Unsupported file type: ${mimeType}`);
    }

    // Parse based on file type
    if (isWordDocument(mimeType)) {
      return await parseWordDocument(file);
    }

    if (isPdfDocument(mimeType)) {
      return await parsePdfDocument(file, fileName);
    }

    throw new Error(`Unsupported file type: ${mimeType}`);
  } catch (err: any) {
    console.error("parseResumeBuffer error:", {
      fileName,
      mimeType,
      error: err?.message,
    });
    throw new Error(`Failed to parse resume: ${err?.message || "Unknown error"}`);
  }
}

// -------------------------
// WORD DOCUMENT PARSER
// -------------------------

/**
 * Parses DOC/DOCX files using Mammoth library
 * @param file - File buffer
 * @returns Extracted text content
 */
async function parseWordDocument(file: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer: file });

    if (!result.value || result.value.trim().length === 0) {
      throw new Error("No text content extracted from Word document");
    }

    // Log any parsing messages/warnings
    if (result.messages && result.messages.length > 0) {
      console.warn("Mammoth parsing messages:", result.messages);
    }

    return result.value.trim();
  } catch (err: any) {
    console.error("parseWordDocument error:", err);
    throw new Error(`Failed to parse Word document: ${err?.message}`);
  }
}

// -------------------------
// PDF PARSER
// -------------------------

/**
 * Parses PDF files using pdf-parse library
 * @param file - File buffer
 * @param fileName - Optional file name
 * @returns Extracted text content
 */
async function parsePdfDocument(
  file: Buffer,
  fileName?: string
): Promise<string> {
  let parser: PDFParse | null = null;

  try {
    console.log("Parsing PDF with pdf-parse:", { fileName, size: file.length });

    // Create parser instance and extract text
    parser = new PDFParse({ data: file });
    const result = await parser.getText();
    const text = result.text;

    if (!text || text.trim().length === 0) {
      throw new Error("No text content extracted from PDF");
    }

    console.log("PDF parsed successfully:", {
      fileName,
      extractedLength: text.length,
    });

    return text.trim();
  } catch (err: any) {
    console.error("parsePdfDocument error:", err);
    throw new Error(`Failed to parse PDF: ${err?.message}`);
  } finally {
    // Always destroy the parser to free memory
    if (parser) {
      await parser.destroy();
    }
  }
}

// -------------------------
// VALIDATION HELPERS
// -------------------------

/**
 * Validates if a MIME type is supported
 * @param mimeType - MIME type to validate
 * @returns True if MIME type is supported
 */
export function validateFileType(mimeType: string): boolean {
  const allowedTypes = Object.values(SUPPORTED_MIME_TYPES);
  return allowedTypes.includes(mimeType as any);
}

/**
 * Validates if file size is within limits
 * @param size - File size in bytes
 * @param maxMB - Maximum allowed size in MB (default: 5)
 * @returns True if file size is valid
 */
export function validateFileSize(size: number, maxMB: number = MAX_FILE_SIZE_MB): boolean {
  if (size <= 0) {
    return false;
  }
  
  const maxBytes = maxMB * 1024 * 1024;
  return size <= maxBytes;
}

/**
 * Checks if MIME type is a Word document
 */
function isWordDocument(mimeType: string): boolean {
  return (
    mimeType === SUPPORTED_MIME_TYPES.DOCX ||
    mimeType === SUPPORTED_MIME_TYPES.DOC
  );
}

/**
 * Checks if MIME type is a PDF
 */
function isPdfDocument(mimeType: string): boolean {
  return mimeType === SUPPORTED_MIME_TYPES.PDF;
}

/**
 * Gets human-readable file type name
 * @param mimeType - MIME type
 * @returns Human-readable file type
 */
export function getFileTypeName(mimeType: string): string {
  const typeMap: Record<string, string> = {
    [SUPPORTED_MIME_TYPES.PDF]: "PDF",
    [SUPPORTED_MIME_TYPES.DOCX]: "Word Document (DOCX)",
    [SUPPORTED_MIME_TYPES.DOC]: "Word Document (DOC)",
  };

  return typeMap[mimeType] || "Unknown";
}

/**
 * Validates complete file before parsing
 * @param file - File buffer
 * @param mimeType - MIME type
 * @param maxSizeMB - Maximum file size in MB
 * @returns Validation result with error message if invalid
 */
export function validateFile(
  file: Buffer,
  mimeType: string,
  maxSizeMB: number = MAX_FILE_SIZE_MB
): { valid: boolean; error?: string } {
  if (!file || file.length === 0) {
    return { valid: false, error: "File is empty" };
  }

  if (!validateFileType(mimeType)) {
    return { 
      valid: false, 
      error: `Unsupported file type: ${mimeType}. Supported types: PDF, DOC, DOCX` 
    };
  }

  if (!validateFileSize(file.length, maxSizeMB)) {
    return { 
      valid: false, 
      error: `File size exceeds ${maxSizeMB}MB limit` 
    };
  }

  return { valid: true };
}