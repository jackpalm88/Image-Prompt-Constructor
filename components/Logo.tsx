
import React from 'react';

export const DomaLogo: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`flex items-center space-x-3 ${className}`} aria-label="D.O.M.A Image Studio">
    <svg width="48" height="48" viewBox="0 0 52 52" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="doma-yellow-grad" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#E6D073" />
          <stop offset="100%" stopColor="#CCB45F" />
        </linearGradient>
      </defs>
      
      <g transform="translate(1, 1)">
        {/* Green waves */}
        <g>
          <path d="M8 36 Q 19 31 25 36 T 42 36" stroke="#273345" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
          <path d="M8 41 Q 19 36 25 41 T 42 41" stroke="#273345" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
        </g>
        
        {/* Red shape */}
        <path d="M35 34 L48 44 L38 41 L28 44 Z" fill="#8C3331"/>

        {/* Yellow sun/triangle */}
        <g>
          <path d="M25 7 L38 34 L12 34 Z" fill="url(#doma-yellow-grad)" />
          {/* Sun rays */}
          <path d="M25 2 L25 7" stroke="#CCB45F" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M12 11 L15 14" stroke="#CCB45F" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M38 11 L35 14" stroke="#CCB45F" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M6 25 L10 25" stroke="#CCB45F" strokeWidth="2.5" strokeLinecap="round" />
        </g>
        
        {/* Dark gray swirl with dots */}
        <g>
            <path d="M28 5 C 48 5 48 25 32 25 C 20 25 20 40 35 48" stroke="#444445" strokeWidth="5.5" fill="none" strokeLinecap="round" />
            <circle cx="43" cy="9" r="1" fill="#F5F1E6"/>
            <circle cx="45.5" cy="15" r="1" fill="#F5F1E6"/>
            <circle cx="44" cy="22" r="1" fill="#F5F1E6"/>
            <circle cx="40.5" cy="28.5" r="1" fill="#F5F1E6"/>
            <circle cx="35" cy="34" r="1" fill="#F5F1E6"/>
        </g>
      </g>
    </svg>
    <div className="flex flex-col justify-center">
        <span className="font-display text-3xl font-medium tracking-widest text-doma-dark-gray leading-none">D.O.M.A</span>
        <span className="hidden sm:inline-block font-display text-sm font-light tracking-widest text-gray-500 -mt-1">IMAGE STUDIO</span>
    </div>
  </div>
);