export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed.' })
  }

  try {
    const { scriptUrl, payload } = req.body || {}
    if (!scriptUrl || !String(scriptUrl).includes('script.google.com/macros/')) {
      return res.status(400).json({ ok: false, error: 'Provide a deployed Google Apps Script Web App URL.' })
    }

    const upstream = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload || {}),
      redirect: 'follow',
    })

    const text = await upstream.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      return res.status(502).json({
        ok: false,
        error: text || `Apps Script returned HTTP ${upstream.status}.`,
      })
    }

    return res.status(upstream.ok ? 200 : upstream.status).json(data)
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || 'Sheets sync proxy failed.' })
  }
}
