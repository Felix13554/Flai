/**
 * Image compression utility for rating images
 * Compresses images to under specified size while maintaining reasonable quality
 * First converts to WebP format, resizes to HD dimensions, then compresses
 */

interface CompressionOptions {
  maxSizeKB: number;
  maxWidth: number;
  maxHeight: number;
  quality: number;
  format: 'jpeg' | 'webp';
}

const DEFAULT_OPTIONS: CompressionOptions = {
  maxSizeKB: 500,
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 0.8,
  format: 'webp' // Default to WebP for better compression
};

/**
 * Compresses an image file to meet size requirements
 * First converts to WebP format, resizes to HD dimensions, then compresses if needed
 */
export const compressImage = async (
  file: File, 
  options: Partial<CompressionOptions> = {}
): Promise<File> => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }
    
    // Create object URL for the image
    const objectUrl = URL.createObjectURL(file);
    
    const handleImageLoad = () => {
      try {
        // Clean up object URL immediately after loading
        URL.revokeObjectURL(objectUrl);
        
        // Calculate new dimensions while maintaining aspect ratio
        // First resize to HD dimensions, then apply max width/height constraints
        const hdDimensions = calculateHDDimensions(img.width, img.height);
        const finalDimensions = calculateDimensions(
          hdDimensions.width, 
          hdDimensions.height, 
          opts.maxWidth, 
          opts.maxHeight
        );
        
        canvas.width = finalDimensions.width;
        canvas.height = finalDimensions.height;
        
        // Draw and compress the image
        ctx.drawImage(img, 0, 0, finalDimensions.width, finalDimensions.height);
        
        // Start with WebP format and the specified quality, reduce if needed
        compressToTarget(canvas, opts, file.name)
          .then(resolve)
          .catch(reject);
          
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };
    
    const handleImageError = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };
    
    // Set up event handlers
    img.onload = handleImageLoad;
    img.onerror = handleImageError;
    
    // Set the source to start loading
    img.src = objectUrl;
  });
};

/**
 * Calculate HD dimensions while maintaining aspect ratio
 * Targets common HD resolutions: 1920x1080 (16:9), 1080x1080 (1:1), etc.
 */
const calculateHDDimensions = (
  originalWidth: number,
  originalHeight: number
): { width: number; height: number } => {
  const aspectRatio = originalWidth / originalHeight;
  
  // If image is already smaller than HD, keep original size
  if (originalWidth <= 1920 && originalHeight <= 1080) {
    return { width: originalWidth, height: originalHeight };
  }
  
  let targetWidth: number;
  let targetHeight: number;
  
  if (aspectRatio > 1.7) {
    // Very wide image - use 1920 width
    targetWidth = 1920;
    targetHeight = Math.round(targetWidth / aspectRatio);
  } else if (aspectRatio > 1.3) {
    // Standard landscape (16:9, 16:10, etc.) - use 1920x1080
    targetWidth = 1920;
    targetHeight = Math.round(targetWidth / aspectRatio);
    // Ensure height doesn't exceed 1080
    if (targetHeight > 1080) {
      targetHeight = 1080;
      targetWidth = Math.round(targetHeight * aspectRatio);
    }
  } else if (aspectRatio > 0.9) {
    // Nearly square - use 1080x1080 max
    const maxDimension = 1080;
    if (originalWidth > originalHeight) {
      targetWidth = maxDimension;
      targetHeight = Math.round(targetWidth / aspectRatio);
    } else {
      targetHeight = maxDimension;
      targetWidth = Math.round(targetHeight * aspectRatio);
    }
  } else {
    // Portrait - use 1080 height
    targetHeight = 1080;
    targetWidth = Math.round(targetHeight * aspectRatio);
  }
  
  return { 
    width: Math.round(targetWidth), 
    height: Math.round(targetHeight) 
  };
};

/**
 * Calculate new dimensions while maintaining aspect ratio within max constraints
 */
const calculateDimensions = (
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } => {
  let { width, height } = { width: originalWidth, height: originalHeight };
  
  // Scale down if image is larger than max dimensions
  if (width > maxWidth || height > maxHeight) {
    const aspectRatio = width / height;
    
    if (width > height) {
      width = maxWidth;
      height = width / aspectRatio;
      
      // If height is still too large, scale by height
      if (height > maxHeight) {
        height = maxHeight;
        width = height * aspectRatio;
      }
    } else {
      height = maxHeight;
      width = height * aspectRatio;
      
      // If width is still too large, scale by width
      if (width > maxWidth) {
        width = maxWidth;
        height = width / aspectRatio;
      }
    }
  }
  
  return { width: Math.round(width), height: Math.round(height) };
};

/**
 * Compress canvas to target file size
 * Tries WebP first, falls back to JPEG if WebP is not supported
 */
const compressToTarget = async (
  canvas: HTMLCanvasElement,
  options: CompressionOptions,
  originalName: string
): Promise<File> => {
  const targetSizeBytes = options.maxSizeKB * 1024;
  let quality = options.quality;
  let attempts = 0;
  const maxAttempts = 10;
  
  // Check if WebP is supported
  const supportsWebP = await checkWebPSupport();
  const format = supportsWebP ? 'webp' : 'jpeg';
  
  while (attempts < maxAttempts) {
    const blob = await canvasToBlob(canvas, format, quality);
    
    if (blob.size <= targetSizeBytes || quality <= 0.1) {
      // Create file with appropriate extension
      const extension = format === 'webp' ? '.webp' : '.jpg';
      const fileName = originalName.replace(/\.[^/.]+$/, '') + extension;
      
      return new File([blob], fileName, {
        type: blob.type,
        lastModified: Date.now()
      });
    }
    
    // Reduce quality for next attempt
    quality = Math.max(0.1, quality - 0.1);
    attempts++;
  }
  
  // If we can't get under target size, return the smallest version
  const blob = await canvasToBlob(canvas, format, 0.1);
  const extension = format === 'webp' ? '.webp' : '.jpg';
  const fileName = originalName.replace(/\.[^/.]+$/, '') + extension;
  
  return new File([blob], fileName, {
    type: blob.type,
    lastModified: Date.now()
  });
};

/**
 * Check if the browser supports WebP format
 */
const checkWebPSupport = (): Promise<boolean> => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    
    canvas.toBlob((blob) => {
      resolve(blob !== null);
    }, 'image/webp', 0.1);
  });
};

/**
 * Convert canvas to blob with specified format and quality
 */
const canvasToBlob = (
  canvas: HTMLCanvasElement,
  format: 'jpeg' | 'webp',
  quality: number
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const mimeType = format === 'webp' ? 'image/webp' : 'image/jpeg';
    
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob from canvas'));
        }
      },
      mimeType,
      quality
    );
  });
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Validate file type for images
 */
export const isValidImageType = (file: File): boolean => {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  return validTypes.includes(file.type);
};

/**
 * Validate file size (max 30MB)
 */
export const isValidFileSize = (file: File, maxSizeMB: number = 30): boolean => {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return file.size <= maxSizeBytes;
}