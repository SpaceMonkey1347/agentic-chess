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
