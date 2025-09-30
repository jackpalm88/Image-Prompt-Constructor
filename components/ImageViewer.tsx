
import React, { useState, MouseEvent } from 'react';
import { ZoomInIcon, ZoomOutIcon, ResetZoomIcon } from './icons';

const ImageViewer: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });

  const handleZoomIn = () => setScale(s => Math.min(s + 0.2, 3));
  const handleZoomOut = () => setScale(s => Math.max(s - 0.2, 0.5));
  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (scale <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    setStartPos({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    e.preventDefault();
    setPosition({
      x: e.clientX - startPos.x,
      y: e.clientY - startPos.y,
    });
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };
  
  return (
    <div 
        className="w-full h-full flex items-center justify-center overflow-hidden rounded-xl bg-gray-100 relative"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
    >
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-full object-contain"
        style={{
          transform: `scale(${scale}) translate(${position.x}px, ${position.y}px)`,
          cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
          transition: isDragging ? 'none' : 'transform 0.15s ease-out',
        }}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
      />
      <div className="absolute bottom-3 right-3 bg-white/70 backdrop-blur-sm p-1 rounded-xl flex items-center space-x-1 shadow-md border border-gray-200/50">
        <button onClick={(e) => { e.stopPropagation(); handleZoomOut(); }} title="Zoom Out" className="p-2 text-doma-dark-gray hover:text-doma-green hover:bg-gray-200/50 rounded-lg transition-colors"><ZoomOutIcon className="h-5 w-5" /></button>
        <button onClick={(e) => { e.stopPropagation(); handleReset(); }} title="Reset Zoom" className="p-2 text-doma-dark-gray hover:text-doma-green hover:bg-gray-200/50 rounded-lg transition-colors"><ResetZoomIcon className="h-5 w-5" /></button>
        <button onClick={(e) => { e.stopPropagation(); handleZoomIn(); }} title="Zoom In" className="p-2 text-doma-dark-gray hover:text-doma-green hover:bg-gray-200/50 rounded-lg transition-colors"><ZoomInIcon className="h-5 w-5" /></button>
      </div>
    </div>
  );
};

export default ImageViewer;
