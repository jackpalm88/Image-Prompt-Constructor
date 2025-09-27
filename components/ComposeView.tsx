import React, { useState } from 'react';
import { ImageFile } from '../types';
import { composeImages, fileToBase64 } from '../services/geminiService';
import { DownloadIcon, WarningIcon } from './icons';
import ImageViewer from './ImageViewer';
import Spinner from './Spinner';

interface ComposeViewProps {
  setError: (error: string | null) => void;
  addHistoryItem: (resultImage: string, prompt: string, inputImages: string[]) => void;
}

const ImageSlot: React.FC<{image: ImageFile | null; onImageChange: (file: File) => void; onClear: () => void;}> = ({ image, onImageChange, onClear }) => {
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if(e.target.files?.[0]) {
            onImageChange(e.target.files[0]);
        }
    }
    return (
        <div className="w-full h-48 border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center relative bg-gray-800/50">
            {image ? (
                <>
                    <img src={image.preview} alt="upload preview" className="h-full w-full object-contain rounded-lg p-1"/>
                    <button onClick={onClear} className="absolute top-1 right-1 bg-red-600/80 text-white rounded-full h-6 w-6 flex items-center justify-center font-bold text-sm">&times;</button>
                </>
            ) : (
                <input type="file" onChange={handleFileChange} accept="image/*" className="w-full h-full opacity-0 cursor-pointer absolute inset-0" />
            )}
             {!image && <span className="text-gray-500">Click or drop image</span>}
        </div>
    )
}


const ComposeView: React.FC<ComposeViewProps> = ({ setError, addHistoryItem }) => {
  const [images, setImages] = useState<(ImageFile | null)[]>([null, null, null]);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [composePrompt, setComposePrompt] = useState('Blend the logo from Image 1 onto the t-shirt in Image 2, preserving folds, lighting direction, and fabric texture.');
  const [isComposing, setIsComposing] = useState(false);

  const handleImageChange = async (file: File, index: number) => {
    const base64 = await fileToBase64(file);
    const newImages = [...images];
    newImages[index] = { file, preview: URL.createObjectURL(file), base64 };
    setImages(newImages);
  };
  
  const handleClearImage = (index: number) => {
      const newImages = [...images];
      if(newImages[index]?.preview) URL.revokeObjectURL(newImages[index]!.preview);
      newImages[index] = null;
      setImages(newImages);
  }

  const handleSubmit = async () => {
    const validImages = images.filter(img => img !== null) as ImageFile[];
    if (validImages.length < 2) {
      setError("Please upload at least two images to compose.");
      return;
    }

    setIsComposing(true);
    setError(null);
    setResultImage(null);

    try {
      const imagePayload = validImages.map(img => ({ base64: img.base64, mimeType: img.file.type }));
      const imageUrl = await composeImages(imagePayload, composePrompt);
      setResultImage(imageUrl);
      addHistoryItem(imageUrl, composePrompt, validImages.map(img => img.preview));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsComposing(false);
    }
  };

  const handleDownload = () => {
    if (!resultImage) return;
    const link = document.createElement('a');
    link.href = resultImage;
    link.download = `nano-banana-composed-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-4 md:p-8 h-full">
      <div className="flex flex-col space-y-4">
        <h2 className="text-2xl font-bold text-cyan-300">Image Composer</h2>
        <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">1. Upload up to 3 Images</label>
            <div className="grid grid-cols-3 gap-4">
                {images.map((img, i) => (
                    <ImageSlot key={i} image={img} onImageChange={(file) => handleImageChange(file, i)} onClear={() => handleClearImage(i)} />
                ))}
            </div>
        </div>
        <div className="space-y-2">
            <label htmlFor="compose-prompt" className="block text-sm font-medium text-gray-300">2. Describe how to combine them</label>
            <textarea id="compose-prompt" value={composePrompt} onChange={e => setComposePrompt(e.target.value)} rows={4} className="w-full bg-gray-800 border border-gray-600 rounded-md shadow-sm p-2 text-white focus:ring-cyan-500 focus:border-cyan-500" placeholder="e.g., place the cat from image 1 into the scene from image 2." />
        </div>
        <button onClick={handleSubmit} disabled={isComposing} className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-3 px-4 rounded-lg transition duration-300 shadow-lg disabled:bg-cyan-800 disabled:cursor-not-allowed">Compose Image</button>
      </div>
      <div className="bg-gray-800/50 rounded-lg flex flex-col justify-center p-4 min-h-[400px] lg:min-h-0">
        {isComposing ? <Spinner message="Composing images..." /> :
         resultImage ? (
          <>
            <div className="flex-grow w-full relative">
              <ImageViewer src={resultImage} alt="Composed result" />
            </div>
            <div className="flex-shrink-0 flex flex-col items-center space-y-3 pt-4">
              <div className="flex space-x-4">
                  <button onClick={handleDownload} className="flex items-center space-x-2 bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
                      <DownloadIcon className="h-5 w-5" />
                      <span>Download</span>
                  </button>
              </div>
              <div className="flex items-center p-3 rounded-md bg-yellow-900/50 text-yellow-300 text-sm">
                  <WarningIcon className="h-5 w-5 mr-2 flex-shrink-0"/>
                  <span>Downloaded images may contain a SynthID watermark for identification.</span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-grow flex items-center justify-center text-center text-gray-400">
            <p>Your composed image will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ComposeView;
