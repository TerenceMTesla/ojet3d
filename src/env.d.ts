/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRODIA_API_KEY: string
  readonly VITE_TRIPO_API_KEY: string
  readonly VITE_MESHY_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
