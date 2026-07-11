import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    dts({ rollupTypes: true, tsconfigPath: './tsconfig.ds.json', entryRoot: 'src' }),
  ],
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/ds-entry.js'),
      name: 'ProgressRPG',
      formats: ['es'],
      fileName: () => 'index.es.js',
    },
    outDir: 'dist-ds',
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        /^react\/jsx-runtime$/,
        /^react\/jsx-dev-runtime$/,
        /^react-dom\/.*/,
      ],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
    cssCodeSplit: false,
  },
});
