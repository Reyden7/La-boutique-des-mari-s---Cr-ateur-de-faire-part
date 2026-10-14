import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';import tailwindcss from '@tailwindcss/vite';import {fileURLToPath} from 'node:url';
export default defineConfig({plugins:[react(),tailwindcss(),{
  name:'isolated-card-video-qa',enforce:'pre',resolveId(source){if(source.endsWith('/lib/supabase')||source.endsWith('/contexts/AuthContext'))return fileURLToPath(new URL('./preview-videos.mock.tsx',import.meta.url));}
}]});
