import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/_shared/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/features/**/logic.ts', 'src/features/**/schema.ts', 'src/lib/**/*.ts', 'supabase/functions/_shared/**/*.ts'],
      exclude: ['**/*.test.ts'],
    },
  },
});
