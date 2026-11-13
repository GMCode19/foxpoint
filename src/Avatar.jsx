import { ini } from './lib'

// foto profilo rotonda; senza foto, le iniziali
export function Avatar({ url, name, className = '', ...rest }) {
  return (
    <span className={'avatar ' + className} {...rest}>
      {url ? <img src={url} alt="" loading="lazy" decoding="async" /> : ini(name || '?')}
    </span>
  )
}
