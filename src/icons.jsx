// Icone a tratto (stesso stile ovunque), colore = colore del testo
const P = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }

export const Icon = {
  trophy: p => <svg {...P} {...p}><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></svg>,
  target: p => <svg {...P} {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M12 1v4M12 19v4M1 12h4M19 12h4" /></svg>,
  calendar: p => <svg {...P} {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>,
  user: p => <svg {...P} {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>,
  shield: p => <svg {...P} {...p}><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z" /></svg>,
  check: p => <svg {...P} {...p}><path d="M5 12l5 5 9-10" /></svg>,
  back: p => <svg {...P} {...p}><path d="M15 6l-6 6 6 6" /></svg>,
  chevron: p => <svg {...P} {...p}><path d="M9 6l6 6-6 6" /></svg>,
  help: p => <svg {...P} {...p}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01" /></svg>,
  logout: p => <svg {...P} {...p}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" /></svg>,
  bell: p => <svg {...P} {...p}><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0" /></svg>,
  share: p => <svg {...P} {...p}><path d="M12 3v13M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>,
  camera: p => <svg {...P} {...p}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>,
  wifiOff: p => <svg {...P} {...p}><path d="M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 10.7 5M5 12.6a10 10 0 0 1 4-2.2M19 12.6a10 10 0 0 0-2.3-1.5M8.5 16.3a5 5 0 0 1 7 0M12 20h.01M3 3l18 18" /></svg>,
}
