// Shared client helper for the "Scan Screenshot" feature. Both the Token
// Library and Promo Inventory tabs use this to send a promo screenshot to the
// Claude vision endpoint (server/api.py → /api/parse-promo) and get back
// structured fields. Each tab normalizes the result into its own schema.

const IMAGE_TYPE_RE = /^image\/(png|jpe?g|gif|webp)$/

export function isSupportedImage(file) {
  return !!file && IMAGE_TYPE_RE.test(file.type)
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.onload = () => {
      const url = String(reader.result)
      resolve(url.includes(',') ? url.split(',')[1] : url)
    }
    reader.readAsDataURL(file)
  })
}

// Send an image to the extraction endpoint. `target` is 'token' | 'promo'.
// Resolves to the partial field object Claude extracted; throws on failure.
export async function scanPromoImage(file, target = 'token') {
  const base64 = await toBase64(file)
  let res
  try {
    res = await fetch('/api/parse-promo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: base64, media_type: file.type, target }),
    })
  } catch {
    throw new Error('Could not reach the server. Is the Python server running (npm run server)?')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) throw new Error(data.error || `Request failed (${res.status}).`)
  return data.token || {}
}
