import EditableContent from './EditableContent';
import React, { useState } from 'react';
import { Upload, X, Image, AlertTriangle, CheckCircle } from 'lucide-react';
import { compressImage, formatFileSize, isValidImageType, isValidFileSize } from '../utils/imageCompression';
import toast from 'react-hot-toast';

interface RatingImageUploadProps {
  onImagesChange: (images: string[]) => void;
  images: string[];
  maxImages?: number;
}

interface UploadProgress {
  file: File;
  status: 'compressing' | 'uploading' | 'completed' | 'error';
  originalSize: number;
  compressedSize?: number;
  error?: string;
  format?: string;
}

const RatingImageUpload: React.FC<RatingImageUploadProps> = ({ 
  onImagesChange, 
  images, 
  maxImages = 4 
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);

  // Convert File to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  // Upload image via Edge Function
  const uploadImageViaEdgeFunction = async (file: File): Promise<string> => {
    const base64Data = await fileToBase64(file);
    
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-rating-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        imageData: base64Data,
        fileName: file.name,
        fileType: file.type,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success || !result.url) {
      throw new Error(result.error || 'Upload failed');
    }

    return result.url;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    if (files.length === 0) return;
    
    // Check if adding these files would exceed the limit
    if (images.length + files.length > maxImages) {
      toast.error(`Du kan maksimalt uploade ${maxImages} billeder`);
      return;
    }

    // Validate files
    const invalidFiles = files.filter(file => !isValidImageType(file));
    if (invalidFiles.length > 0) {
      toast.error(`Nogle filer er ikke gyldige billedformater (JPG, PNG, WebP)`);
      return;
    }

    const oversizedFiles = files.filter(file => !isValidFileSize(file, 30));
    if (oversizedFiles.length > 0) {
      toast.error(`Nogle filer er større end 30MB`);
      return;
    }

    setUploading(true);
    
    // Initialize progress tracking
    const initialProgress: UploadProgress[] = files.map(file => ({
      file,
      status: 'compressing',
      originalSize: file.size
    }));
    setUploadProgress(initialProgress);

    try {
      const uploadedUrls: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        try {
          // Update status to compressing
          setUploadProgress(prev => prev.map((item, index) => 
            index === i ? { ...item, status: 'compressing' } : item
          ));

          // Compress the image (will convert to WebP automatically)
          const compressedFile = await compressImage(file, {
            maxSizeKB: 500,
            maxWidth: 1920,
            maxHeight: 1080,
            quality: 0.8,
            format: 'webp' // Explicitly request WebP format
          });

          // Update progress with compressed size and format
          setUploadProgress(prev => prev.map((item, index) => 
            index === i ? { 
              ...item, 
              status: 'uploading',
              compressedSize: compressedFile.size,
              format: compressedFile.name.endsWith('.webp') ? 'WebP' : 'JPEG'
            } : item
          ));

          // Upload via Edge Function
          const url = await uploadImageViaEdgeFunction(compressedFile);
          if (!url) throw new Error(`Kunne ikke uploade ${file.name}`);
          
          uploadedUrls.push(url);

          // Update status to completed
          setUploadProgress(prev => prev.map((item, index) => 
            index === i ? { ...item, status: 'completed' } : item
          ));

        } catch (error: any) {
          console.error(`Error processing ${file.name}:`, error);
          
          // Update status to error
          setUploadProgress(prev => prev.map((item, index) => 
            index === i ? { 
              ...item, 
              status: 'error',
              error: error.message 
            } : item
          ));
        }
      }

      if (uploadedUrls.length > 0) {
        const newImages = [...images, ...uploadedUrls];
        onImagesChange(newImages);
        toast.success(`${uploadedUrls.length} billede(r) uploadet og konverteret til WebP`);
      }

      if (uploadedUrls.length < files.length) {
        const failedCount = files.length - uploadedUrls.length;
        toast.error(`${failedCount} billede(r) kunne ikke uploades`);
      }

    } catch (error: any) {
      console.error('Error uploading images:', error);
      toast.error('Fejl ved upload af billeder');
    } finally {
      setUploading(false);
      // Clear progress after a delay
      setTimeout(() => setUploadProgress([]), 3000);
    }

    // Clear the input
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    onImagesChange(newImages);
  };

  const canUploadMore = images.length < maxImages;

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      {canUploadMore && (
        <div>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            className="hidden"
            id="rating-image-upload"
            disabled={uploading}
          />
          
          <label
            htmlFor="rating-image-upload"
            className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-neutral-700 rounded-lg cursor-pointer hover:border-neutral-600 transition-colors bg-neutral-800/50"
          >
            {uploading ? (
              <div className="flex flex-col items-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
                <p className="text-sm text-neutral-400"><EditableContent contentKey="rating-image-upload-konverterer-til-webp-og-uploader" fallback="Konverterer til WebP og uploader..." /></p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <Upload size={24} className="text-neutral-400 mb-2" />
                <p className="text-sm text-neutral-400 text-center">
                  <EditableContent contentKey="rating-image-upload-klik-for-at-uploade-billeder" fallback="Klik for at uploade billeder" />
                </p>
                <p className="text-xs text-neutral-500 mt-1">
                  <EditableContent contentKey="rating-image-upload-maks" fallback="Maks" /> {maxImages} <EditableContent contentKey="rating-image-upload-billeder-op-til-30mb-hver" fallback="billeder, op til 30MB hver" />
                </p>
                <p className="text-xs text-neutral-500">
                  <EditableContent contentKey="rating-image-upload-konverteres-automatisk-til-webp-under" fallback="Konverteres automatisk til WebP under 500KB" />
                </p>
              </div>
            )}
          </label>
        </div>
      )}

      {/* Upload Progress */}
      {uploadProgress.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-neutral-300"><EditableContent contentKey="rating-image-upload-upload-status" fallback="Upload status:" /></h4>
          {uploadProgress.map((progress, index) => (
            <div key={index} className="bg-neutral-700/20 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-neutral-300 truncate">
                  {progress.file.name}
                </span>
                <div className="flex items-center space-x-2">
                  {progress.status === 'compressing' && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  )}
                  {progress.status === 'uploading' && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-warning"></div>
                  )}
                  {progress.status === 'completed' && (
                    <CheckCircle size={16} className="text-success" />
                  )}
                  {progress.status === 'error' && (
                    <AlertTriangle size={16} className="text-error" />
                  )}
                </div>
              </div>
              
              <div className="text-xs text-neutral-400">
                <div className="flex justify-between">
                  <span><EditableContent contentKey="rating-image-upload-original" fallback="Original:" /> {formatFileSize(progress.originalSize)}</span>
                  {progress.compressedSize && (
                    <span>
                      {progress.format}: {formatFileSize(progress.compressedSize)}
                    </span>
                  )}
                </div>
                
                {progress.status === 'compressing' && (
                  <p className="text-warning mt-1"><EditableContent contentKey="rating-image-upload-konverterer-til-webp" fallback="Konverterer til WebP..." /></p>
                )}
                {progress.status === 'uploading' && (
                  <p className="text-warning mt-1"><EditableContent contentKey="rating-image-upload-uploader-via-server" fallback="Uploader via server..." /></p>
                )}
                {progress.status === 'completed' && progress.compressedSize && (
                  <p className="text-success mt-1">
                    <EditableContent contentKey="rating-image-upload-faerdig-reduktion" fallback="Færdig! Reduktion:" /> {((progress.originalSize - progress.compressedSize) / progress.originalSize * 100).toFixed(1)}%
                  </p>
                )}
                {progress.status === 'error' && (
                  <p className="text-error mt-1">{progress.error}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Image Preview Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {images.map((url, index) => (
            <div key={index} className="relative group">
              <img
                src={url}
                alt={`Rating billede ${index + 1}`}
                className="w-full h-24 object-cover rounded-lg"
              />
              <button
                onClick={() => removeImage(index)}
                className="absolute top-1 right-1 p-1 bg-neutral-800/80 rounded-full text-white hover:bg-neutral-700 transition-colors opacity-0 group-hover:opacity-100"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload Status */}
      <div className="flex items-center justify-between text-sm text-neutral-400">
        <span>{images.length} <EditableContent contentKey="rating-image-upload-af" fallback="af" /> {maxImages} <EditableContent contentKey="rating-image-upload-billeder" fallback="billeder" /></span>
        {images.length >= maxImages && (
          <span className="text-warning"><EditableContent contentKey="rating-image-upload-maksimalt-antal-billeder-naaet" fallback="Maksimalt antal billeder nået" /></span>
        )}
      </div>
    </div>
  );
};

export default RatingImageUpload;