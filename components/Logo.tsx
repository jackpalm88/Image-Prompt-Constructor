import React from 'react';

export const DomaLogo: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`flex items-center space-x-3 ${className}`} aria-label="D.O.M.A Image Studio">
    <img 
      src="https://cdn.jsdelivr.net/gh/jackpalm88/Image-Prompt-Constructor@main/components/doma_logo_icononly_clean_512.png" 
      alt="D.O.M.A Logo" 
      width="48" 
      height="48" 
      className="flex-shrink-0" 
      role="img"
    />
    <div className="flex flex-col justify-center">
        <span className="font-display text-3xl font-medium tracking-widest text-doma-dark-gray leading-none">D.O.M.A</span>
        <span className="hidden sm:inline-block font-display text-sm font-light tracking-widest text-gray-500 -mt-1">IMAGE STUDIO</span>
    </div>
  </div>
);