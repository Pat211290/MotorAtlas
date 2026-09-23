import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base:'/',
  plugins:[react()],
  server:{port:5173,host:true},
  build:{
    sourcemap:true,
    rollupOptions:{
      input:{
        main:resolve(process.cwd(),'index.html'),
        bestaetigung:resolve(process.cwd(),'bestaetigung/index.html'),
        anmelden:resolve(process.cwd(),'anmelden/index.html'),
        passwortZuruecksetzen:resolve(process.cwd(),'passwort-zuruecksetzen/index.html')
      }
    }
  }
});
