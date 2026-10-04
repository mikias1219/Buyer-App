/**
 * Client-side image preparation (SPEC A5 flow 3): resize to max 1280px, encode WebP (~0.8),
 * fall back to JPEG where the WebView cannot encode WebP. Also returns a SHA-256 of the
 * output for duplicate-photo detection (A3.8).
 */
export const MAX_DIMENSION = 1280;
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export interface PreparedImage {
  blob: Blob;
  ext: 'webp' | 'jpg';
  hash: string;
  width: number;
  height: number;
}

export function fitWithin(width: number, height: number, max = MAX_DIMENSION): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      /* fall back to <img> (older iOS WebViews) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const { source, width, height } = await decode(file);
  const size = fitWithin(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');
  ctx.drawImage(source, 0, 0, size.width, size.height);

  let blob = await toBlob(canvas, 'image/webp', 0.8);
  let ext: PreparedImage['ext'] = 'webp';
  if (!blob || blob.type !== 'image/webp') {
    blob = await toBlob(canvas, 'image/jpeg', 0.82);
    ext = 'jpg';
  }
  if (!blob) throw new Error('encode_failed');
  if (blob.size > MAX_UPLOAD_BYTES) {
    blob = (await toBlob(canvas, ext === 'webp' ? 'image/webp' : 'image/jpeg', 0.6)) ?? blob;
  }
  return { blob, ext, hash: await sha256Hex(blob), width: size.width, height: size.height };
}
