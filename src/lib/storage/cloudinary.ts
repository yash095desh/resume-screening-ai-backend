import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

export async function uploadToCloudinary(
  file: Buffer,
  folder: string,
  fileName: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: 'raw',
        public_id: fileName,          
        type: 'authenticated',        
        flags: 'attachment:false'
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result!.secure_url);
      }
    );

    uploadStream.end(file);
  });
}

export async function deleteFromCloudinary(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId);
}

export async function getCloudinaryFile(url: string): Promise<Buffer> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export { cloudinary };