import { notFound } from 'next/navigation';

/**
 * The rendering service is an internal capability of the 玄甲 global agent.
 * It intentionally has no standalone product home page or independent identity.
 */
export default function RuntimeRootPage() {
  notFound();
}
