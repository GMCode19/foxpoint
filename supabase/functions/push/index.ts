// FOX POINT - funzione "push" (Supabase Edge Function)
// Invia le notifiche accodate dal database (tabella push_queue) ai telefoni iscritti (push_subscriptions).
// - Chiamata dal database a ogni nuovo messaggio, con il codice segreto x-hook-secret.
// - Al primo avvio crea da sola le chiavi VAPID e le salva in push_config (nessuna chiave da copiare a mano).
// - { "init": true } dall'app: restituisce solo la chiave pubblica.
// Crittografia Web Push standard (RFC 8291 aes128gcm + RFC 8292 VAPID) fatta con Web Crypto, senza librerie.
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUBJECT = 'https://gmcode19.github.io/foxpoint/'

// ==== WEBPUSH START (parte collaudata anche fuori da Supabase) ====
const enc = new TextEncoder()
const b64u = (buf) => { let s = ''; for (const c of new Uint8Array(buf)) s += String.fromCharCode(c); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
const ub64u = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); s += '='.repeat((4 - s.length % 4) % 4); return Uint8Array.from(atob(s), c => c.charCodeAt(0)) }
const concat = (...a) => { const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of a) { out.set(x, o); o += x.length } return out }
const hkdf = async (salt, ikm, info, len) => new Uint8Array(await crypto.subtle.deriveBits(
  { name: 'HKDF', hash: 'SHA-256', salt, info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), len * 8))

export async function makeVapidKeys() {
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  return { publicKey: b64u(await crypto.subtle.exportKey('raw', k.publicKey)), privateJwk: JSON.stringify(await crypto.subtle.exportKey('jwk', k.privateKey)) }
}

async function vapidHeader(endpoint, publicKey, privateJwk) {
  const aud = new URL(endpoint).origin
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const body = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT })))
  const key = await crypto.subtle.importKey('jwk', JSON.parse(privateJwk), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + body))
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${publicKey}`
}

// cifra il messaggio per un telefono (p256dh e auth arrivano dalla sua iscrizione)
export async function encrypt(payload, p256dh, auth) {
  const uaPublic = ub64u(p256dh), authSecret = ub64u(auth)
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256))
  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(enc.encode(payload), new Uint8Array([2]))))
  const header = new Uint8Array(21); header.set(salt); new DataView(header.buffer).setUint32(16, 4096); header[20] = asPublic.length
  return concat(header, asPublic, cipher)
}

export async function sendPush(sub, payload, keys) {
  const body = await encrypt(payload, sub.p256dh, sub.auth)
  return fetch(sub.endpoint, {
    method: 'POST', body,
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Encoding': 'aes128gcm', TTL: '86400', Urgency: 'normal',
      Authorization: await vapidHeader(sub.endpoint, keys.publicKey, keys.privateJwk) },
  })
}
// ==== WEBPUSH END ====

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// chiave del server: le nuove "secret keys" (SUPABASE_SECRET_KEYS, JSON) oppure la vecchia service_role
function serverKey() {
  try { const k = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'); const v = k.default || Object.values(k)[0]; if (v) return v } catch { /* formato diverso */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
}

Deno.serve(async (req) => {
  try { return await handle(req) } catch (e) {
    console.log('push errore', String(e?.stack || e))
    return json({ error: String(e?.message || e) }, 500)
  }
})

async function handle(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const key = serverKey()
  if (!key) return json({ error: 'Chiave del server non trovata nelle variabili della funzione' }, 500)
  const sb = createClient(Deno.env.get('SUPABASE_URL'), key, { auth: { persistSession: false } })

  let { data: cfg, error } = await sb.from('push_config').select('*').eq('id', 1).single()
  if (error || !cfg) return json({ error: 'Lettura di push_config non riuscita: ' + (error?.message || 'esegui lo script foxpoint_09_notifiche.sql') }, 500)
  if (!cfg.public_key) {   // primo avvio: crea le chiavi una volta sola
    const k = await makeVapidKeys()
    const up = await sb.from('push_config').update({ public_key: k.publicKey, private_key: k.privateJwk }).eq('id', 1).is('public_key', null)
    if (up.error) return json({ error: 'Salvataggio delle chiavi non riuscito: ' + up.error.message }, 500)
    cfg = (await sb.from('push_config').select('*').eq('id', 1).single()).data
  }
  const body = await req.json().catch(() => ({}))
  if (body.init) return json({ publicKey: cfg.public_key })
  if (req.headers.get('x-hook-secret') !== cfg.hook_secret) return json({ error: 'non autorizzato' }, 401)

  const keys = { publicKey: cfg.public_key, privateJwk: cfg.private_key }
  const { data: jobs } = await sb.from('push_queue').select('*').is('sent_at', null).order('id').limit(50)
  let sent = 0, removed = 0
  for (const job of jobs || []) {
    await sb.from('push_queue').update({ sent_at: new Date().toISOString() }).eq('id', job.id).is('sent_at', null)
    const { data: subs } = await sb.from('push_subscriptions').select('*').in('blader_id', job.blader_ids)
    const payload = JSON.stringify({ title: job.title, body: job.body, url: job.url, tag: job.tag })
    await Promise.all((subs || []).filter(s => s.prefs?.[job.kind] !== false).map(async s => {
      try {
        const r = await sendPush(s, payload, keys)
        if (r.status === 404 || r.status === 410) { await sb.from('push_subscriptions').delete().eq('id', s.id); removed++ }
        else if (r.ok) sent++
        else console.log('push', r.status, await r.text())
      } catch (e) { console.log('push errore', String(e)) }
    }))
  }
  // pulizia: messaggi inviati più vecchi di 30 giorni
  await sb.from('push_queue').delete().lt('created_at', new Date(Date.now() - 30 * 864e5).toISOString()).not('sent_at', 'is', null)
  return json({ jobs: jobs?.length || 0, sent, removed })
}
