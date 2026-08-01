export interface ImageCompressorOptions {
  /** Maximum width in pixels. Default is 1920. */
  maxWidth?: number;
  /** Maximum height in pixels. Default is 1920. */
  maxHeight?: number;
  /** Compression quality between 0 and 1. Default is 0.85. */
  quality?: number;
  /** Output MIME type. Default is 'image/jpeg'. */
  mimeType?: string;
}

/**
 * Compresses and resizes an image File in the browser using HTML5 Canvas.
 * Returns a new compressed File object. If compression fails or is unsupported,
 * returns the original file as a fallback.
 */
export async function compressImage(
  file: File,
  options: ImageCompressorOptions = {}
): Promise<File> {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.85,
    mimeType = 'image/jpeg',
  } = options;

  // Don't compress non-image files or SVG
  if (!file || !file.type || !file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    return file;
  }

  try {
    const drawSource = await getCanvasImageSource(file);
    if (!drawSource) {
      return file;
    }

    const { width, height } = drawSource;
    if (!width || !height) {
      if ('close' in drawSource && typeof (drawSource as ImageBitmap).close === 'function') {
        (drawSource as ImageBitmap).close();
      }
      return file;
    }

    // Calculate scaled dimensions maintaining aspect ratio
    let targetWidth = width;
    let targetHeight = height;

    if (targetWidth > maxWidth || targetHeight > maxHeight) {
      const widthRatio = maxWidth / targetWidth;
      const heightRatio = maxHeight / targetHeight;
      const ratio = Math.min(widthRatio, heightRatio);

      targetWidth = Math.max(1, Math.round(targetWidth * ratio));
      targetHeight = Math.max(1, Math.round(targetHeight * ratio));
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      if ('close' in drawSource && typeof (drawSource as ImageBitmap).close === 'function') {
        (drawSource as ImageBitmap).close();
      }
      return file;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(drawSource, 0, 0, targetWidth, targetHeight);

    if ('close' in drawSource && typeof (drawSource as ImageBitmap).close === 'function') {
      (drawSource as ImageBitmap).close();
    }

    const blob = await canvasToBlob(canvas, mimeType, quality);
    if (!blob) {
      return file;
    }

    // Replace extension if needed
    const ext = mimeType === 'image/webp' ? '.webp' : '.jpg';
    const newFileName = replaceFileExtension(file.name, ext);

    return new File([blob], newFileName, {
      type: mimeType,
      lastModified: Date.now(),
    });
  } catch (error) {
    console.warn('Compresión de imagen falló, usando archivo original:', error);
    return file;
  }
}

/**
 * Compresses multiple image files concurrently.
 */
export async function compressImages(
  files: File[],
  options?: ImageCompressorOptions
): Promise<File[]> {
  return Promise.all(files.map((file) => compressImage(file, options)));
}

async function getCanvasImageSource(file: File): Promise<{ width: number; height: number; close?: () => void } & CanvasImageSource | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Fallback to HTMLImageElement if createImageBitmap fails
    }
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      mimeType,
      quality
    );
  });
}

function replaceFileExtension(filename: string, newExt: string): string {
  const pos = filename.lastIndexOf('.');
  if (pos === -1) return `${filename}${newExt}`;
  return `${filename.substring(0, pos)}${newExt}`;
}
