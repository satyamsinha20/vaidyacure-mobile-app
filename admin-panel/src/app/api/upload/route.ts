import { NextRequest, NextResponse } from 'next/server';
import cloudinary, { CLOUDINARY_FOLDER } from '@/lib/cloudinary';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    // 1. Verify Cloudinary credentials in .env
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret || cloudName === 'your_cloud_name_here') {
      return NextResponse.json(
        {
          success: false,
          error:
            'Cloudinary credentials are not configured yet in .env. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
        },
        { status: 400 }
      );
    }

    // 2. Extract uploaded file from multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No image file provided in upload request.' },
        { status: 400 }
      );
    }

    // Validate mime type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { success: false, error: 'Uploaded file must be a valid image (PNG, JPG, WEBP, etc).' },
        { status: 400 }
      );
    }

    // 3. Convert file to base64 Data URI
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const mimeType = file.type || 'image/jpeg';
    const dataUri = `data:${mimeType};base64,${buffer.toString('base64')}`;

    // 4. Upload to Cloudinary into folder "vaidyacure_app"
    const uploadResult = await cloudinary.uploader.upload(dataUri, {
      folder: CLOUDINARY_FOLDER,
      resource_type: 'image',
    });

    return NextResponse.json({
      success: true,
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
      folder: CLOUDINARY_FOLDER,
    });
  } catch (error: any) {
    console.error('Cloudinary upload error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to upload image to Cloudinary.',
      },
      { status: 500 }
    );
  }
}
