import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    // next-env.d.ts 는 Next.js 가 생성하고 덮어쓰는 파일이라 손대지 않는다.
    ignores: ['.next/**', 'node_modules/**', 'supabase/**', 'next-env.d.ts'],
  },
];

export default config;
