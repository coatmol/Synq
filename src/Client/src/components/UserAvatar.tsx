import {Tooltip} from "@heroui/react";

interface UserAvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  tooltipContent?: React.ReactNode;
}

const getAvatarColor = (name: string) => {
  const colors = [
    '#b91c1c', // red-700
    '#c2410c', // orange-700
    '#b45309', // amber-700
    '#15803d', // green-700
    '#047857', // emerald-700
    '#0f766e', // teal-700
    '#0e7490', // cyan-700
    '#1d4ed8', // blue-700
    '#4338ca', // indigo-700
    '#6d28d9', // violet-700
    '#7e22ce', // purple-700
    '#a21caf', // fuchsia-700
    '#be185d', // pink-700
    '#be123c'  // rose-700
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export function UserAvatar({name, size = 'md', className = '', tooltipContent}: UserAvatarProps) {
  const initials = name ? name.substring(0, 2).toUpperCase() : 'ME';
  const bgColor = getAvatarColor(name || 'ME');

  const sizeClasses = {
    sm: 'w-6 h-6 text-[9px]',
    md: 'w-8 h-8 text-[11px]',
    lg: 'w-10 h-10 text-[14px]'
  };

  return (
    <Tooltip delay={500}>
      <Tooltip.Trigger>
        <div
          className={`relative inline-flex items-center justify-center rounded-full font-bold text-white shadow-md border border-white/10 shrink-0 ${sizeClasses[size]} ${className}`}
          style={{
            backgroundColor: bgColor,
            textShadow: '0 1px 2px rgba(0,0,0,0.2)'
          }}
        >
          {initials}
        </div>
      </Tooltip.Trigger>
      <Tooltip.Content placement="top" showArrow={true}
                       className="dark bg-zinc-800 text-zinc-100 text-[11px] px-2 py-1 rounded shadow-xl">
        {tooltipContent || name}
      </Tooltip.Content>
    </Tooltip>
  );
}
