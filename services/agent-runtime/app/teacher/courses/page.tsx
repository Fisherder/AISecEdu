import { notFound, redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Compatibility route for links retained by the vendored renderer.
 *
 * Course authority and teacher navigation belong exclusively to 玄甲.
 * The internal capability runtime must never expose its historical course UI,
 * even when a trusted service request bypasses the ordinary session middleware.
 */
export default function LegacyRuntimeTeacherCoursesPage() {
  const parent = (process.env.AISECEDU_PUBLIC_ORIGIN || '').replace(/\/$/, '');
  if (!parent) notFound();
  redirect(`${parent}/teacher`);
}
