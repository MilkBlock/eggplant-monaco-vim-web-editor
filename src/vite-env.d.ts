/// <reference types="vite/client" />

declare module '*.rs?raw' {
  const content: string;
  export default content;
}
