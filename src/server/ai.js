const chatURL = (endpoint) => {
    // return `${base}/chat/completions`
    const base = endpoint.trim().replace(/\/+$/, '')
    return /\/v\d+$/.test(base)
        ? `${base}/chat/completions`
        : `${base}/v1/chat/completions`
}

export async function requestMove({ endpoint, apiKey, model, prompt }) {
    const res = await fetch(chatURL(endpoint), {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey || 'local'}`,
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            stream: false,
            temperature: 0,
        }),
        signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) {
        throw new Error(
            `upstream ${res.status}: ${(await res.text()).slice(0, 300)}`
        )
    }
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? ''
}

/** a probe should not hang the sidebar the way a real move may */
const PROBE_TIMEOUT_MS = 15_000

/**
 * Probe the endpoint the way a move request would, but ask for a single token.
 * On failure the field to blame is returned, so the sidebar can point at it.
 */
export async function checkConnection({ endpoint, apiKey, model }) {
    if (!endpoint?.trim()) {
        return { ok: false, field: 'endpoint', error: 'Endpoint is required.' }
    }
    if (!model?.trim()) {
        return { ok: false, field: 'model', error: 'Model name is required.' }
    }
    let res
    try {
        res = await fetch(chatURL(endpoint), {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${apiKey || 'local'}`,
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: 'ping' }],
                max_tokens: 1,
                stream: false,
                temperature: 0,
            }),
            signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        })
    } catch (err) {
        return {
            ok: false,
            field: 'endpoint',
            error: `Could not reach the endpoint: ${err?.message ?? String(err)}`,
        }
    }
    if (res.ok) {
        return { ok: true }
    }
    const body = (await res.text()).slice(0, 300)
    if (res.status === 401 || res.status === 403) {
        return { ok: false, field: 'apiKey', error: body }
    }
    if (/model/i.test(body)) {
        return { ok: false, field: 'model', error: body }
    }
    return { ok: false, field: 'endpoint', error: body }
}
