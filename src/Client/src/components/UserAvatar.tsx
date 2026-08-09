import React from 'react';

interface UserAvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const getAvatarColor = (name: string) => {
  const colors = [
    '#dc2626', // red-600
    '#ea580c', // orange-600
    '#d97706', // amber-600
    '#16a34a', // green-600
    '#059669', // emerald-600
    '#0d9488', // teal-600
    '#0891b2', // cyan-600
    '#2563eb', // blue-600
    '#4f46e5', // indigo-600
    '#7c3aed', // violet-600
    '#9333ea', // purple-600
    '#c026d3', // fuchsia-600
    '#db2777', // pink-600
    '#e11d48'  // rose-600
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export function UserAvatar({ name, size = 'md', className = '' }: UserAvatarProps) {
  const initials = name ? name.substring(0, 2).toUpperCase() : 'ME';
  const bgColor = getAvatarColor(name || 'ME');
  
  const sizeClasses = {
    sm: 'w-6 h-6 text-[9px]',
    md: 'w-8 h-8 text-[11px]',
    lg: 'w-10 h-10 text-[14px]'
  };

  return (
    <div 
      className={`relative inline-flex items-center justify-center rounded-full font-bold text-white shadow-md border border-white/10 shrink-0 ${sizeClasses[size]} ${className}`}
      style={{ 
        backgroundColor: bgColor,
        textShadow: '0 1px 2px rgba(0,0,0,0.2)' 
      }}
      title={name}
    >
      {initials}
    </div>
  );
}
