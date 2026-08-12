'use client';

import { useCallback, useState, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import Cropper, { type Area } from 'react-easy-crop';
import { Camera, Link, Upload, X, Check } from 'lucide-react';
import { compressCroppedImage, MAX_RAW_FILE_SIZE } from '@/lib/image-utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useI18n } from '@/hooks/useI18n';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ImageUploaderProps {
  /** Current Base64 data URI (or null if no image) */
  value: string | null;
  /** Called when image changes (Base64 data URI) or is cleared (null) */
  onChange: (value: string | null) => void;
  /** Product ID for URL proxy fetch */
  productId?: string;
}

type Mode = 'idle' | 'cropping' | 'url-input';

export default function ImageUploader({ value, onChange, productId }: ImageUploaderProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('idle');
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect] = useState(1); // Always 1:1
  const [urlInput, setUrlInput] = useState('');
  const [fetching, setFetching] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const cropAreaRef = useRef<{ x: number; y: number; width: number; height: number }>({ x: 0, y: 0, width: 0, height: 0 });
  // Cache-busting query param for the existing-image URL below. Lazy-initialized once per
  // mount (the form modal remounts this component each time it opens) instead of calling
  // Date.now() directly during render, which would refetch the image on every re-render.
  const [cacheBust] = useState(() => Date.now());

  const processFile = useCallback(async (file: File) => {
    if (file.size > MAX_RAW_FILE_SIZE) {
      toast.error(`File too large (max ${MAX_RAW_FILE_SIZE / 1024 / 1024} MB)`);
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Load into crop editor
    const reader = new FileReader();
    reader.onload = () => {
      setCropSrc(reader.result as string);
      setMode('cropping');
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    };
    reader.onerror = () => {
      toast.error('Failed to read image file');
    };
    reader.readAsDataURL(file);
  }, []);

  const handleCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    cropAreaRef.current = {
      x: croppedAreaPixels.x,
      y: croppedAreaPixels.y,
      width: croppedAreaPixels.width,
      height: croppedAreaPixels.height,
    };
  }, []);

  const handleCropSave = useCallback(async () => {
    if (!cropSrc) return;

    try {
      const img = new Image();
      img.src = cropSrc;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image for cropping'));
      });

      // Use the actual pixel coordinates from react-easy-crop, or fall back to full natural size
      const width = cropAreaRef.current.width || img.width;
      const height = cropAreaRef.current.height || img.height;
      const x = cropAreaRef.current.x || 0;
      const y = cropAreaRef.current.y || 0;

      const dataUri = compressCroppedImage(img, { x, y, width, height });
      if (!dataUri) {
        toast.error('Could not compress this image enough. Try a tighter crop or another image.');
        return;
      }

      onChange(dataUri);
      setMode('idle');
      setCropSrc(null);
      toast.success('Image ready');
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to crop image';
      toast.error(errorMsg);
      setMode('idle');
      setCropSrc(null);
    }
  }, [cropSrc, onChange]);

  const handleUrlFetch = useCallback(async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    if (!trimmed.toLowerCase().startsWith('https://')) {
      toast.error('Only HTTPS URLs are supported');
      return;
    }
    setFetching(true);

    try {
      const res = await api.post('/products/fetch-url', { url: trimmed });
      const dataUri = res.data.data;

      if (!dataUri) {
        toast.error('Could not fetch image from URL');
        return;
      }

      // Load into crop editor
      setCropSrc(dataUri);
      setMode('cropping');
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setUrlInput('');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      const msg = axiosErr.response?.data?.error || 'Failed to fetch image';
      toast.error(msg);
    } finally {
      setFetching(false);
    }
  }, [urlInput]);

  const handleRemove = useCallback(() => {
    onChange(null);
    setMode('idle');
    setCropSrc(null);
  }, [onChange]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      processFile(acceptedFiles[0]);
    }
  }, [processFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    maxFiles: 1,
    noClick: false,
    noKeyboard: false,
  });

  const closeCrop = () => {
    setMode('idle');
    setCropSrc(null);
  };

  // ── Crop modal ──────────────────────────────────────────────────────
  if (mode === 'cropping' && cropSrc) {
    return (
      <Dialog open onOpenChange={(open) => { if (!open) closeCrop(); }}>
        <DialogContent className="max-w-lg gap-0 overflow-hidden border-flo-border bg-flo-surface p-0 sm:max-w-lg">
          <DialogHeader className="border-b border-flo-border px-4 py-3">
            <DialogTitle className="text-flo-text">{t('products.cropImage')}</DialogTitle>
          </DialogHeader>
          <div className="relative aspect-square w-full bg-flo-bg">
            <Cropper
              image={cropSrc}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={handleCropComplete}
            />
          </div>
          <DialogFooter className="flex-row items-center gap-3 border-t border-flo-border px-4 py-3 sm:justify-between">
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="min-w-0 flex-1"
            />
            <button
              type="button"
              onClick={handleCropSave}
              className="flex min-h-11 items-center gap-2 rounded-flo-md bg-flo-brand-600 px-4 py-2 text-white transition-colors hover:bg-flo-brand-700"
            >
              <Check size={16} />
              Apply
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── URL input mode ──────────────────────────────────────────────────
  if (mode === 'url-input') {
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://example.com/photo.jpg"
            className="min-h-11 flex-1 rounded-flo-md border border-flo-border bg-flo-surface px-3 py-2 text-sm text-flo-text outline-none focus:border-flo-brand-500 focus:ring-2 focus:ring-flo-brand-500"
            onKeyDown={(e) => e.key === 'Enter' && handleUrlFetch()}
          />
          <button
            type="button"
            onClick={handleUrlFetch}
            disabled={fetching || !urlInput.trim()}
            className="min-h-11 rounded-flo-md bg-flo-brand-600 px-3 py-2 text-sm text-white hover:bg-flo-brand-700 disabled:opacity-50"
          >
            {fetching ? 'Fetching...' : 'Fetch'}
          </button>
          <button
            type="button"
            onClick={() => { setMode('idle'); setUrlInput(''); }}
            className="min-h-11 px-3 py-2 text-sm text-flo-text-secondary hover:text-flo-text"
          >
            Cancel
          </button>
        </div>
        <p className="text-xs text-flo-text-muted">Only HTTPS URLs supported. Image will be fetched, cropped, and stored locally.</p>
      </div>
    );
  }

  // ── Idle mode — show current image or upload controls ────────────────
  const previewUrl = value === 'EXISTING' && productId
    ? `${api.defaults.baseURL}/products/${productId}/image?t=${cacheBust}`
    : (value !== 'EXISTING' ? value : null);

  return (
    <div className="space-y-2">
      {/* Current image preview */}
      {previewUrl && (
        <div className="relative h-24 w-24 overflow-hidden rounded-flo-md border border-flo-border">
          <img src={previewUrl} alt="Product" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-flo-danger text-white hover:bg-flo-danger/90"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Upload controls */}
      <div className="space-y-3">
        {/* Large File drop zone */}
        <div
          {...getRootProps()}
          className={`flex w-full cursor-pointer flex-col items-center justify-center rounded-flo-lg border-2 border-dashed p-6 transition-colors ${
            isDragActive
              ? 'border-flo-brand-600 bg-flo-brand-50 text-flo-brand-600'
              : 'border-flo-border-strong text-flo-text-secondary hover:border-flo-brand-600 hover:bg-flo-bg'
          }`}
        >
          <input {...getInputProps()} />
          <Upload size={24} className="mb-2 text-flo-text-muted" />
          <p className="text-center text-sm font-medium">
            {isDragActive ? 'Drop image here...' : 'Drag & drop an image here, or click to browse'}
          </p>
        </div>

        <div className="flex items-center justify-center gap-2">
          <div className="h-px flex-1 bg-flo-border" />
          <span className="px-2 text-xs font-medium uppercase text-flo-text-muted">OR USE</span>
          <div className="h-px flex-1 bg-flo-border" />
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {/* Camera button (tablet POS) */}
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="flex min-h-11 items-center gap-2 rounded-flo-md border border-flo-border px-4 py-2 text-sm text-flo-text transition-colors hover:border-flo-border-strong hover:bg-flo-bg"
          >
            <Camera size={16} />
            Camera
          </button>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) processFile(file);
              e.target.value = '';
            }}
          />

          {/* URL paste */}
          <button
            type="button"
            onClick={() => setMode('url-input')}
            className="flex min-h-11 items-center gap-2 rounded-flo-md border border-flo-border px-4 py-2 text-sm text-flo-text transition-colors hover:border-flo-border-strong hover:bg-flo-bg"
          >
            <Link size={16} />
            Paste URL
          </button>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-flo-text-muted">
        Max {MAX_RAW_FILE_SIZE / 1024 / 1024} MB. Images are compressed to WebP.
      </p>
    </div>
  );
}
