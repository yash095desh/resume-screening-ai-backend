import { createClient } from "@supabase/supabase-js";

// -------------------------
// SUPABASE CLIENT
// -------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

// -------------------------
// UPLOAD FILE TO SUPABASE
// -------------------------

/**
 * Uploads a file buffer to Supabase storage
 * @param file - File buffer to upload
 * @param bucket - Storage bucket name
 * @param path - Relative path within bucket (e.g., "jobId/file.pdf")
 * @returns Public URL of uploaded file
 */
export async function uploadToSupabase(
  file: Buffer,
  bucket: string,
  path: string
): Promise<string> {
  try {
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      contentType: "application/octet-stream",
      upsert: true,
    });

    if (error) {
      throw new Error(`Supabase upload failed: ${error.message}`);
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    
    if (!data?.publicUrl) {
      throw new Error("Failed to generate public URL");
    }

    return data.publicUrl;
  } catch (err: any) {
    console.error("uploadToSupabase error:", err);
    throw new Error(err?.message || "Failed to upload file to storage");
  }
}

// -------------------------
// DOWNLOAD FILE FROM SUPABASE
// -------------------------

/**
 * Downloads a file from Supabase storage and returns buffer with MIME type
 * @param path - File path in storage bucket
 * @param bucket - Storage bucket name (defaults to "resumes")
 * @returns Object containing file buffer and MIME type
 */
export async function getSupabaseFile(
  path: string,
  bucket: string = "resumes"
): Promise<{ buffer: Buffer; mimeType: string }> {
  try {
    if (!path) {
      throw new Error("File path is required");
    }

    const { data, error } = await supabase.storage
      .from(bucket)
      .download(path);

    if (error) {
      throw new Error(`Supabase download failed: ${error.message}`);
    }

    if (!data) {
      throw new Error("No file data returned from storage");
    }

    // Convert blob to buffer
    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Determine MIME type from file extension
    const mimeType = getMimeTypeFromPath(path);

    return { buffer, mimeType };
  } catch (err: any) {
    console.error("getSupabaseFile error:", err);
    throw new Error(err?.message || "Failed to download file from storage");
  }
}

// -------------------------
// DELETE FILE FROM SUPABASE
// -------------------------

/**
 * Deletes a file from Supabase storage
 * @param path - File path in storage bucket
 * @param bucket - Storage bucket name (defaults to "resumes")
 */
export async function deleteFromSupabase(
  path: string,
  bucket: string = "resumes"
): Promise<void> {
  try {
    if (!path) {
      throw new Error("File path is required");
    }

    const { error } = await supabase.storage.from(bucket).remove([path]);

    if (error) {
      throw new Error(`Supabase delete failed: ${error.message}`);
    }
  } catch (err: any) {
    console.error("deleteFromSupabase error:", err);
    throw new Error(err?.message || "Failed to delete file from storage");
  }
}

// -------------------------
// HELPER FUNCTIONS
// -------------------------

/**
 * Determines MIME type based on file extension
 * @param path - File path
 * @returns MIME type string
 */
function getMimeTypeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();

  const mimeTypes: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
  };

  return mimeTypes[ext || ""] || "application/octet-stream";
}

/**
 * Check if file exists in Supabase storage
 * @param path - File path in storage bucket
 * @param bucket - Storage bucket name (defaults to "resumes")
 * @returns Boolean indicating if file exists
 */
export async function fileExistsInSupabase(
  path: string,
  bucket: string = "resumes"
): Promise<boolean> {
  try {
    const { data, error } = await supabase.storage.from(bucket).list(
      path.substring(0, path.lastIndexOf("/")),
      {
        search: path.substring(path.lastIndexOf("/") + 1),
      }
    );

    return !error && data && data.length > 0;
  } catch (err) {
    console.error("fileExistsInSupabase error:", err);
    return false;
  }
}