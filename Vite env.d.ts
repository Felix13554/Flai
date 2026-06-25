/// <reference types="vite/client" />

declare module 'virtual:content-keys' {
  export interface ContentKeyEntry {
    key: string;
    fallback: string;
    type: 'editableContent' | 'getContent';
    file: string;
  }
  export const CONTENT_KEYS: ContentKeyEntry[];
}