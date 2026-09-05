import React, { useState, useEffect } from 'react';
import { Upload, Trash2, Copy, Check, Image as ImageIcon, X } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import toast from 'react-hot-toast';
import EditableContent from '../EditableContent';
import ImageUpload from '../ImageUpload';

interface ExternalImage {
  id: string;
  url: string;
  filename: string;
  size: number;
  created_at: string;
}

const ExternalImagesManager: React.FC = () => {
  const [images, setImages] = useState<ExternalImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploader, setShowUploader] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadImages();
  }, []);

  const loadImages = async () => {
    try {
      const { data, error } = await supabase
        .from('external_images')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setImages(data || []);
    } catch (err) {
      console.error('Error loading images:', err);
      toast.error('Kunne ikke indlæse billeder');
    } finally {
      setLoading(false);
    }
  };

  const handleImageUploaded = async (url: string, isYoutube?: boolean) => {
    if (!url) return; // Ignore if it's the component's internal clear action

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const filename = isYoutube ? 'YouTube Video' : (url.split('/').pop() || 'uploaded_image');

      const { error: dbError } = await supabase
        .from('external_images')
        .insert([{
          url: url,
          filename: filename,
          size: 0, // Using 0 as size is now handled edge-side 
          created_by: user?.id
        }]);

      if (dbError) throw dbError;

      // The ImageUpload component already handles upload success toasts, 
      // so we simply silently reload the images.
      await loadImages();
    } catch (err) {
      console.error('Error saving image record:', err);
      toast.error('Kunne ikke gemme billededata');
    }
  };

  const handleDelete = async (image: ExternalImage) => {
    if (!window.confirm('Er du sikker på at du vil slette dette billede?')) return;

    try {
      // Do not attempt to remove from Storage if it's a YouTube link
      if (!image.url.startsWith('youtube:')) {
        const pathParts = image.url.split('/');
        const fileName = pathParts[pathParts.length - 1];

        const { error: storageError } = await supabase.storage
          .from('external-images')
          .remove([fileName]);

        // We warn but don't strictly throw here in case the file was already deleted in storage manually
        if (storageError) console.warn('Could not remove from storage:', storageError);
      }

      const { error: dbError } = await supabase
        .from('external_images')
        .delete()
        .eq('id', image.id);

      if (dbError) throw dbError;

      toast.success('Billede slettet');
      await loadImages();
    } catch (err) {
      console.error('Error deleting image:', err);
      toast.error('Kunne ikke slette billede');
    }
  };

  const handleCopyUrl = async (url: string, id: string) => {
    try {
      // Convert youtube pseudo-url to actual watch link if needed, otherwise copy raw
      const finalUrl = url.startsWith('youtube:') 
        ? `https://www.youtube.com/watch?v=${url.split(':')[1]}` 
        : url;

      await navigator.clipboard.writeText(finalUrl);
      setCopiedId(id);
      toast.success('URL kopieret til udklipsholder');
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Error copying to clipboard:', err);
      toast.error('Kunne ikke kopiere URL');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          <EditableContent contentKey="external-images-manager-eksterne-billeder" fallback="Eksterne Billeder" />
        </h2>
        <button
          onClick={() => setShowUploader(!showUploader)}
          className="btn-primary flex items-center cursor-pointer transition-all"
        >
          {showUploader ? (
            <>
              <X size={20} className="mr-2" />
              <EditableContent contentKey="external-images-manager-luk-upload" fallback="Luk Upload" />
            </>
          ) : (
            <>
              <Upload size={20} className="mr-2" />
              <EditableContent contentKey="external-images-manager-upload-billede" fallback="Upload Billede" />
            </>
          )}
        </button>
      </div>

      {/* Conditionally reveal the integrated Uploader component */}
      {showUploader && (
        <div className="bg-neutral-800/40 border border-neutral-700 rounded-lg p-6 shadow-sm">
          <ImageUpload
            onImageUploaded={handleImageUploaded}
            bucket="external-images"
            allowMultiple={true}
          />
        </div>
      )}

      <div className="bg-neutral-700/20 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-neutral-400 text-sm">
              <EditableContent contentKey="external-images-manager-total-billeder" fallback="Total Billeder" />
            </p>
            <p className="text-xl font-bold">{images.length}</p>
          </div>
          <ImageIcon className="text-primary" size={20} />
        </div>
      </div>

      {images.length === 0 ? (
        <div className="text-center py-12 text-neutral-400">
          <ImageIcon size={48} className="mx-auto mb-4 opacity-50" />
          <p>
            <EditableContent contentKey="external-images-manager-ingen-eksterne-billeder-fundet-upload" fallback="Ingen eksterne billeder fundet. Upload det første billede for at komme i gang." />
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {images.map((image) => (
            <div key={image.id} className="bg-neutral-700/20 rounded-lg overflow-hidden flex flex-col">
              <div className="relative aspect-video bg-black">
                {image.url.startsWith('youtube:') ? (
                  <iframe
                    className="w-full h-full object-cover"
                    src={`https://www.youtube.com/embed/${image.url.split(':')[1]}`}
                    title="YouTube preview"
                    frameBorder="0"
                    allowFullScreen
                  />
                ) : (
                  <img
                    src={image.url}
                    alt={image.filename}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>

              <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                <div>
                  <p className="font-medium truncate" title={image.filename}>
                    {image.filename}
                  </p>
                  <p className="text-sm text-neutral-400 mt-1">
                    {image.size > 0 && `${formatFileSize(image.size)} • `} 
                    {new Date(image.created_at).toLocaleDateString('da-DK')}
                  </p>
                </div>

                <div className="flex items-center space-x-2 pt-2">
                  <button
                    onClick={() => handleCopyUrl(image.url, image.id)}
                    className="flex-1 btn-secondary flex items-center justify-center text-sm"
                  >
                    {copiedId === image.id ? (
                      <>
                        <Check size={16} className="mr-2" />
                        <EditableContent contentKey="external-images-manager-kopieret" fallback="Kopieret" />
                      </>
                    ) : (
                      <>
                        <Copy size={16} className="mr-2" />
                        <EditableContent contentKey="external-images-manager-kopier-url" fallback="Kopier URL" />
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(image)}
                    className="btn-secondary p-2 hover:bg-red-600/90 hover:text-white transition-colors border-none bg-neutral-700"
                    title="Slet"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ExternalImagesManager;
