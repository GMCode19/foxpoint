import { useCallback, useEffect, useState } from 'react'
import { sb, LOGO, APP_URL, err, plain } from './lib'

export function NewPassword({ done }) {
  const [pw, setPw] = useState(''), [msg, setMsg] = useState('')
  async function save(e) {
    e.preventDefault()
    const { error } = await sb.auth.updateUser({ password: pw })
    if (error) return setMsg(error.message)
    alert('Password aggiornata.'); done()
  }
  return (
    <form className="card c" onSubmit={save}>
      <img className="logo big" src={LOGO} alt="Lake Fox" />
      <h1>Nuova password</h1>
      <input type="password" placeholder="Nuova password (min. 6 caratteri)" value={pw} onChange={e => setPw(e.target.value)} minLength={6} required />
      <button>Salva</button>
      {msg && <p className="msg">{msg}</p>}
    </form>
  )
}

export function Auth() {
  // mode: login | signup | reset
  const [mode, setMode] = useState('login'), [email, setEmail] = useState(''), [pw, setPw] = useState('')
  const [msg, setMsg] = useState(null), [busy, setBusy] = useState(false)
  const go = m => { setMode(m); setMsg(null) }
  async function submit(e) {
    e.preventDefault(); setMsg(null); setBusy(true)
    try {
      if (mode === 'reset') {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: APP_URL })
        if (error) return setMsg({ bad: true, t: /rate limit/i.test(error.message) ? 'Troppe richieste ravvicinate: riprova tra qualche minuto.' : error.message })
        return setMsg({ t: `Fatto! Abbiamo mandato a ${email} un link per scegliere una nuova password. Controlla anche lo spam.` })
      }
      const { data, error } = mode === 'login'
        ? await sb.auth.signInWithPassword({ email, password: pw })
        : await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: APP_URL } })
      if (error) return setMsg({ bad: true, t: /Invalid login/i.test(error.message) ? 'Email o password non corretti.' : /rate limit/i.test(error.message) ? 'Troppe richieste ravvicinate: riprova tra qualche minuto.' : error.message })
      if (mode === 'signup' && !data.session) setMsg({ t: 'Registrazione fatta! Controlla la mail (anche lo spam) per confermare, poi accedi.' })
    } finally { setBusy(false) }
  }
  const title = { login: 'Fox Point', signup: 'Crea il tuo account', reset: 'Password dimenticata' }[mode]
  const cta = { login: 'Accedi', signup: 'Registrati', reset: 'Inviami il link' }[mode]
  return (
    <form className="card c" onSubmit={submit}>
      <img className="logo big" src={LOGO} alt="Lake Fox" />
      <h1>{title}</h1>
      {mode === 'reset' && <p className="mut note">Scrivi l'email con cui ti sei registrato: ti mandiamo un link per scegliere una nuova password.</p>}
      <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value.trim())} {...plain} autoComplete="email" required autoFocus={mode === 'reset'} />
      {mode !== 'reset' && <input type="password" placeholder="Password (min. 6 caratteri)" value={pw} onChange={e => setPw(e.target.value)} minLength={6} required />}
      <button disabled={busy}>{busy ? 'Attendi…' : cta}</button>
      {msg && <p className={'notice' + (msg.bad ? ' bad' : '')}>{msg.t}</p>}
      {mode === 'login' && <>
        <button type="button" className="ghost" onClick={() => go('signup')}>Non hai un account? Registrati</button>
        <button type="button" className="link" onClick={() => go('reset')}>Password dimenticata?</button>
      </>}
      {mode !== 'login' && <button type="button" className="ghost" onClick={() => go('login')}>Torna all'accesso</button>}
    </form>
  )
}

export function Join({ user, out, onDone }) {
  const [code, setCode] = useState(''), [nick, setNick] = useState(''), [reqs, setReqs] = useState([])
  const loadReqs = useCallback(() => sb.from('join_requests').select('*').eq('user_id', user.id)
    .order('created_at', { ascending: false }).then(({ data }) => setReqs(data || [])), [user.id])
  useEffect(() => { loadReqs() }, [loadReqs])
  async function send(e) {
    e.preventDefault()
    const { error } = await sb.rpc('request_join', { p_code: code, p_nickname: nick })
    if (error) return err(error)
    setCode(''); loadReqs()
  }
  const pending = reqs.find(r => r.status === 'pending')
  return (
    <div className="card">
      <img className="logo big" src={LOGO} alt="Lake Fox" />
      <h1 className="c">Entra nel team</h1>
      {pending
        ? <><p>Richiesta inviata come <b>{pending.nickname}</b>: aspetta l'approvazione di un admin.</p><button onClick={onDone}>Controlla di nuovo</button></>
        : <form onSubmit={send} style={{ display: 'contents' }}>
            <input placeholder="Codice team" value={code} onChange={e => setCode(e.target.value.toUpperCase())} {...plain} required />
            <input placeholder="Il tuo nickname (come in squadra)" value={nick} onChange={e => setNick(e.target.value)} minLength={2} maxLength={30} {...plain} required />
            <button>Invia richiesta</button>
          </form>}
      {reqs[0]?.status === 'rejected' && !pending && <p className="msg">L'ultima richiesta è stata rifiutata.</p>}
      {out}
    </div>
  )
}
