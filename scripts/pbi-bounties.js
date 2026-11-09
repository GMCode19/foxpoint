// Fa "slittare" le taglie Top 10 quando cambia la classifica PBI.
// Il valore dipende dalla posizione (tabella bounty_rank_values, impostata dall'admin dal pannello).
// Funzione pura (non tocca il database), così è collaudabile.
//
// Regole, per ogni taglia della stagione attiva:
//  - giocatore in top 10: valore = valore della sua posizione (se impostato);
//    se è appena entrato in top 10 la taglia si attiva; se era "rilevante" o "capo team" diventa Top 10
//    (categoria e valore precedenti vengono ricordati)
//  - giocatore uscito dalla top 10: la taglia Top 10 si disattiva; se prima era "rilevante" o "capo team"
//    torna com'era, con il suo valore e attivazione invariata
//  - chi resta in top 10 mantiene l'attivazione decisa dall'admin

const TOP = 10
const inTop = r => r != null && r >= 1 && r <= TOP

// bounties: [{ id, team_id, target_id, category, value, active, prev_category, prev_value }]
// oldRank/newRank: Map blader_id -> posizione (prima e dopo l'aggiornamento)
// slots: Map team_id -> Map posizione -> valore
export function planBounties(bounties, oldRank, newRank, slots) {
  const updates = []
  for (const b of bounties) {
    const was = inTop(oldRank.get(b.target_id)), now = inTop(newRank.get(b.target_id))
    const r = newRank.get(b.target_id)
    const u = {}
    if (now) {
      if (b.category !== 'top10') Object.assign(u, { category: 'top10', prev_category: b.category, prev_value: b.value })
      const v = slots.get(b.team_id)?.get(r)
      if (v != null && v !== b.value) u.value = v
      if (!was && !b.active && (v ?? b.value) > 0) u.active = true
    } else if (b.category === 'top10') {
      if (b.prev_category) Object.assign(u, { category: b.prev_category, value: b.prev_value ?? b.value, prev_category: null, prev_value: null })
      else if (was && b.active) u.active = false
    }
    if (Object.keys(u).length) updates.push({ id: b.id, target_id: b.target_id, ...u })
  }
  return updates
}
