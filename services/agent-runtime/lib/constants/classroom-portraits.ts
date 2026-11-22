const bundledClassroomPortraits = new Set([
  '/avatars/teacher.png',
  '/avatars/assist.png',
  '/avatars/clown.png',
  '/avatars/user.png',
]);

export function isBundledClassroomPortrait(path: string): boolean {
  return bundledClassroomPortraits.has(path);
}

export function classroomPortraitUrl(src: string): string {
  if (!isBundledClassroomPortrait(src)) return src;
  return (process.env.NEXT_PUBLIC_BASE_PATH?.trim() || '') + src;
}
