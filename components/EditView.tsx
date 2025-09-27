import React, { useState, useRef, useEffect } from 'react';
import { ImageFile } from '../types';
import { editImage, fileToBase64 } from '../services/geminiService';
import { DownloadIcon, WarningIcon, BrushIcon, EraserIcon } from './icons';
import ImageViewer from './ImageViewer';
import Spinner from './Spinner';

interface EditViewProps {
  setError: (error: string | null) => void;
  addHistoryItem: (resultImage: string, prompt: string, inputImages?: string[]) => void;
}

const EditView: React.FC<EditViewProps> = ({ setError, addHistoryItem }) => {
  const [sourceImage, setSourceImage] = useState<ImageFile | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [changePrompt, setChangePrompt] = useState('a small, friendly llama');
  const [keepPrompt, setKeepPrompt] = useState('the background, original lighting, and shadows');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [brushSize, setBrushSize] = useState(20);
  const [tool, setTool] = useState<'draw' | 'erase'>('draw');

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const base64 = await fileToBase64(file);
      setSourceImage({
        file,
        preview: URL.createObjectURL(file),
        base64,
      });
      setResultImage(null);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceImage) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const image = imageRef.current;
    if (!image) return;

    const resizeCanvas = () => {
        if(image && canvas) {
            const { width, height } = image.getBoundingClientRect();
            canvas.width = width;
            canvas.height = height;
        }
    };
    
    image.onload = resizeCanvas;
    if (image.complete) resizeCanvas();

    window.addEventListener('resize', resizeCanvas);

    const getMousePos = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
          x: (e.clientX - rect.left) * scaleX,
          y: (e.clientY - rect.top) * scaleY
        };
    };

    const startDrawing = (e: MouseEvent) => {
        setIsDrawing(true);
        const { x, y } = getMousePos(e);
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const draw = (e: MouseEvent) => {
        if (!isDrawing) return;
        const { x, y } = getMousePos(e);
        ctx.globalCompositeOperation = tool === 'draw' ? 'source-over' : 'destination-out';
        ctx.lineTo(x, y);
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
        ctx.lineWidth = brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
    };

    const stopDrawing = () => {
        if (isDrawing) {
            ctx.closePath();
            setIsDrawing(false);
        }
    };

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);

    return () => {
      canvas.removeEventListener('mousedown', startDrawing);
      canvas.removeEventListener('mousemove', draw);
      canvas.removeEventListener('mouseup', stopDrawing);
      canvas.removeEventListener('mouseleave', stopDrawing);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [sourceImage, isDrawing, brushSize, tool]);

  const clearMask = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const handleSubmit = async () => {
    if (!sourceImage) {
      setError("Please upload an image first.");
      return;
    }
    setIsEditing(true);
    setError(null);
    setResultImage(null);
    try {
      const imageUrl = await editImage(sourceImage.base64, sourceImage.file.type, changePrompt, keepPrompt);
      setResultImage(imageUrl);
      addHistoryItem(imageUrl, `Change: ${changePrompt}, Keep: ${keepPrompt}`, [sourceImage.preview]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsEditing(false);
    }
  };

  const handleDownload = () => {
    if (!resultImage) return;
    const link = document.createElement('a');
    link.href = resultImage;
    link.download = `nano-banana-edited-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-4 md:p-8 h-full">
      <div className="flex flex-col space-y-4">
        <h2 className="text-2xl font-bold text-cyan-300">Image Editor</h2>
        
        <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">1. Upload Image</label>
            <input type="file" onChange={handleImageUpload} accept="image/*" className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-cyan-800 file:text-cyan-100 hover:file:bg-cyan-700"/>
        </div>

        {sourceImage && (
            <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-300 mb-2">2. Draw a mask on the area you want to change.</p>
                  <div className="flex items-center space-x-4 bg-gray-800 p-2 rounded-lg">
                      <span className="text-sm font-medium text-gray-400">Tools:</span>
                      <button onClick={() => setTool('draw')} title="Brush" className={`p-2 rounded-md ${tool === 'draw' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>
                          <BrushIcon className="h-5 w-5" />
                      </button>
                      <button onClick={() => setTool('erase')} title="Eraser" className={`p-2 rounded-md ${tool === 'erase' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>
                          <EraserIcon className="h-5 w-5" />
                      </button>
                      <div className="flex items-center space-x-2 flex-grow">
                          <label htmlFor="brush-size" className="text-sm font-medium text-gray-400">Size:</label>
                          <input type="range" id="brush-size" min="2" max="100" value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer" />
                      </div>
                  </div>
                </div>

                <div className="space-y-2">
                    <label htmlFor="change-prompt" className="block text-sm font-medium text-gray-300">3. Describe what to change or add</label>
                    <textarea id="change-prompt" value={changePrompt} onChange={e => setChangePrompt(e.target.value)} rows={2} className="w-full bg-gray-800 border border-gray-600 rounded-md shadow-sm p-2 text-white focus:ring-cyan-500 focus:border-cyan-500" placeholder="e.g., a blue bird" />
                </div>
                <div className="space-y-2">
                    <label htmlFor="keep-prompt" className="block text-sm font-medium text-gray-300">4. Describe what to keep untouched</label>
                    <textarea id="keep-prompt" value={keepPrompt} onChange={e => setKeepPrompt(e.target.value)} rows={2} className="w-full bg-gray-800 border border-gray-600 rounded-md shadow-sm p-2 text-white focus:ring-cyan-500 focus:border-cyan-500" placeholder="e.g., the background" />
                </div>
                <div className="flex space-x-4">
                    <button onClick={handleSubmit} disabled={isEditing} className="flex-grow bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-3 px-4 rounded-lg transition duration-300 shadow-lg disabled:bg-cyan-800 disabled:cursor-not-allowed">Apply Edit</button>
                    <button onClick={clearMask} disabled={isEditing} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg transition duration-300 disabled:bg-gray-800 disabled:cursor-not-allowed">Clear Mask</button>
                </div>
            </div>
        )}
      </div>
      <div className="bg-gray-800/50 rounded-lg flex items-center justify-center p-4 min-h-[400px] lg:min-h-0">
        <div className="relative w-full h-full flex items-center justify-center">
            {isEditing ? <Spinner message="Applying edits..." /> :
             sourceImage && !resultImage ? (
                <div className="relative w-full h-full flex items-center justify-center">
                    <img ref={imageRef} src={sourceImage.preview} alt="Source" className="max-w-full max-h-full object-contain rounded-lg" />
                    <canvas ref={canvasRef} className="absolute top-0 left-0 pointer-events-auto" style={{touchAction: 'none'}}></canvas>
                </div>
            ) : resultImage ? (
                <div className="w-full h-full flex flex-col">
                  <div className="flex-grow w-full relative">
                    <ImageViewer src={resultImage} alt="Edited result" />
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
                </div>
            ) : (
                <p className="text-center text-gray-400">Upload an image to start editing.</p>
            )}
        </div>
      </div>
    </div>
  );
};

export default EditView;