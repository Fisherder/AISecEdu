'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from '@/lib/hooks/use-theme';

export function IntegratedThemeBridge() {
  const { setTheme } = useTheme();
  const updateTheme = useRef(setTheme);
  updateTheme.current = setTheme;

  useEffect(() => {
    let parentRoot: HTMLElement;
    try {
      parentRoot = window.parent.document.documentElement;
    } catch {
      return;
    }
    if (window.parent === window) return;
    const root = document.documentElement;
    const keys: Record<string, string> = {
      background: '--ui-bg', foreground: '--ui-text', card: '--ui-surface',
      'card-foreground': '--ui-text', popover: '--ui-surface',
      'popover-foreground': '--ui-text', border: '--ui-border', input: '--ui-border',
      primary: '--theme-primary', 'primary-foreground': '--theme-on-primary',
      muted: '--theme-surface-soft', 'muted-foreground': '--theme-text-muted',
      secondary: '--theme-surface-soft', 'secondary-foreground': '--theme-text',
      accent: '--theme-primary-soft', 'accent-foreground': '--theme-primary', ring: '--theme-primary',
      sidebar: '--ui-surface', 'sidebar-foreground': '--ui-text',
      'sidebar-border': '--ui-border', 'sidebar-accent': '--theme-primary-soft',
      'sidebar-accent-foreground': '--theme-primary',
    };
    let applied = '';
    const sync = () => {
      const computed = window.parent.getComputedStyle(parentRoot);
      for (const [key, token] of Object.entries(keys)) {
        const value = computed.getPropertyValue(token).trim();
        if (value) root.style.setProperty('--' + key, value);
      }
      const palette = parentRoot.dataset.aiseceduPalette || 'light';
      root.dataset.aiseceduPalette = palette;
      root.dataset.aiseceduMotion = parentRoot.dataset.aiseceduMotion || 'full';
      const theme = parentRoot.dataset.aiseceduTheme === 'dark' ? 'dark' : 'light';
      if (applied !== theme) {
        applied = theme;
        updateTheme.current(theme);
      }
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(parentRoot, { attributes: true, attributeFilter: ['data-aisecedu-palette', 'data-aisecedu-theme', 'data-aisecedu-motion', 'style'] });
    return () => observer.disconnect();
  }, []);

  return null;
}
