import React, { useState } from 'react';

export type FolderColor = 'emerald' | 'cyan' | 'lime';

interface GlassFolderProps {
  title: string;
  description: string;
  color: FolderColor;
  onDropFiles?: (files: File[]) => void;
  onClick?: () => void;
}

export function GlassFolder({ title, description, color, onDropFiles, onClick }: GlassFolderProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      onDropFiles?.(files);
    }
  };

  const active = isHovered || isDragging;

  // Color variants matching the specific design
  const colorVariants = {
    emerald: {
      back: 'bg-[#50C878]', // Bright Emerald
      front: 'bg-[#50C878]/30 border-white/40',
      tab: 'bg-[#50C878]',
    },
    cyan: {
      back: 'bg-[#00E5FF]', // Bright Cyan
      front: 'bg-[#00E5FF]/40 border-white/40',
      tab: 'bg-[#00E5FF]',
    },
    lime: {
      back: 'bg-[#B2FF59]', // Bright Lime
      front: 'bg-[#B2FF59]/30 border-white/40',
      tab: 'bg-[#B2FF59]',
    },
  }[color];

  const springConfig = {
    transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    transitionDuration: '500ms'
  };

  return (
    <div className="flex flex-col items-center group/wrapper">
      <div 
        className="relative w-[280px] h-[200px] cursor-pointer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={onClick}
        style={{ perspective: '1200px' }}
      >
        {/* Floor Shadow */}
        <div className={`absolute -bottom-4 left-4 right-4 h-6 rounded-full bg-black/5 blur-xl transition-all duration-500 ${active ? 'opacity-30 scale-110' : 'opacity-10 scale-100'}`}></div>

        {/* Back Tab */}
        <div className={`absolute top-0 left-4 w-1/3 h-12 ${colorVariants.tab} rounded-t-[20px] transition-colors`}></div>
        
        {/* Back Body */}
        <div className={`absolute inset-0 top-8 ${colorVariants.back} rounded-[24px] shadow-inner transition-colors`}></div>
        
        {/* Paper / Content Card */}
        <div 
          className={`absolute left-6 right-6 h-[160px] bg-white rounded-t-xl shadow-[0_4px_20px_rgba(0,0,0,0.05)] p-5 flex flex-col items-start border border-gray-50/50 ${
            active ? 'top-8 opacity-100' : 'top-12 opacity-0 pointer-events-none'
          }`}
          style={{ 
            zIndex: 10,
            ...springConfig,
            transform: active ? 'translateY(-100px)' : 'translateY(0)',
          }}
        >
          <div className="w-12 h-1.5 bg-gray-100 rounded-full mb-4"></div>
          <p className="text-[14px] text-gray-700 leading-relaxed font-medium">
            {description}
          </p>
        </div>
        
        {/* Front Glass Cover (The Trapzoidal Illusion via RotateX) */}
        <div 
          className={`absolute inset-0 top-8 ${colorVariants.front} backdrop-blur-[12px] rounded-[24px] border-t border-l border-r shadow-[0_8px_32px_0_rgba(0,0,0,0.05)] flex items-center justify-center overflow-hidden`}
          style={{ 
            zIndex: 20,
            transformOrigin: 'bottom',
            ...springConfig,
            transform: active ? 'rotateX(-25deg)' : 'rotateX(0deg)'
          }}
        >
          {/* Glass edge highlights */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-white/10 via-white/80 to-white/10"></div>
          <div className="absolute left-0 top-0 bottom-0 w-[1px] bg-gradient-to-b from-white/60 to-transparent"></div>
          
          {/* Shine effect passing over on hover */}
          <div className="absolute -inset-1/2 bg-gradient-to-tr from-transparent via-white/30 to-transparent rotate-45 translate-x-[-150%] group-hover/wrapper:translate-x-[150%] transition-transform duration-1000 ease-in-out"></div>

          {/* Drag & Drop Feedback */}
          {isDragging && (
            <div className="absolute inset-4 bg-white/20 backdrop-blur-md flex items-center justify-center border-2 border-white/60 border-dashed rounded-[16px]">
              <span className="text-gray-800 font-semibold bg-white/50 px-5 py-2 rounded-full shadow-sm text-sm">
                Drop files here
              </span>
            </div>
          )}
        </div>
      </div>
      
      {/* Title */}
      <h3 className="mt-8 text-neutral-text-primary font-semibold text-lg transition-transform duration-500 group-hover/wrapper:-translate-y-1">
        {title}
      </h3>
    </div>
  );
}
