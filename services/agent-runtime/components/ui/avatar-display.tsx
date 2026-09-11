'use client';

import { cn } from '@/lib/utils';

interface AvatarDisplayProps {
  readonly src: string;
  readonly alt?: string;
  readonly className?: string;
}

export function AvatarDisplay({ src, alt, className }: AvatarDisplayProps) {
  const isUrl = src.startsWith('http') || src.startsWith('data:') || src.startsWith('/');

  if (isUrl) {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    const url = basePath && src.startsWith('/') && !src.startsWith('//') && !src.startsWith(basePath + '/') ? basePath + src : src;
    return (
      <img src={url} alt={alt || ''} className={cn('w-full h-full object-cover', className)} />
    );
  }

  return (
    <span
      role="img"
      aria-label={alt || ''}
      className={cn('flex items-center justify-center w-full h-full select-none', className)}
    >
      {src}
    </span>
  );
}
