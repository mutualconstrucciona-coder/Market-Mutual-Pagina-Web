import { parseImportFile } from './import-file'

self.onmessage = async ({ data }: MessageEvent<File>) => {
  try {
    self.postMessage({ parsed: await parseImportFile(data) })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'No se pudo leer el archivo.' })
  }
}
