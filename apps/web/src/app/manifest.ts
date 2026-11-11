import type { MetadataRoute } from 'next';

/** `/manifest.webmanifest`: the VET Group logo's own sizes, the same files POD Studio serves (public/icons). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Creative Video Studio',
    short_name: 'Video Studio',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
