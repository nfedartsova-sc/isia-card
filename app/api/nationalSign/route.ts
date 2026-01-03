import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  _request: Request
) {
  try {
    const imagesDirectory = path.join(process.cwd(), 'public/images');
    const imagePath = path.join(imagesDirectory, `NationalSign.webp`);

    if (!fs.existsSync(imagePath)) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    const imageBuffer = fs.readFileSync(imagePath);

    return new Response(imageBuffer, {
      headers: {
        'Content-Type': 'image/webp',
        //'Cache-Control': 'no-store', // TODO: ? do not store image in browser cache or store it there with 'public, max-age=86400', // 24 hours
      },
    });
  } catch (error) {
    console.error('Error serving image:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
