import encode, { init } from '@jsquash/webp/encode'
import scalarWasm from '@jsquash/webp/codec/enc/webp_enc.wasm?url'
import simdWasm from '@jsquash/webp/codec/enc/webp_enc_simd.wasm?url'

// Assets are bundled locally. Safari can decode WebP without supporting canvas encoding.
const ready = init({ locateFile: (path: string) => path.includes('simd') ? simdWasm : scalarWasm })
self.onmessage = async ({ data }) => {
  const { id, pixels, width, height, quality } = data
  try {
    await ready
    const bytes = await encode(new ImageData(new Uint8ClampedArray(pixels), width, height), {
      quality, low_memory: 1, method: 4
    })
    self.postMessage({ id, bytes }, { transfer: [bytes] })
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  }
}
