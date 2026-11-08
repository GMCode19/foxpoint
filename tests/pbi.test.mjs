import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRanking, validateRanking } from '../scripts/pbi-parse.js'
import { planSync } from '../scripts/pbi-plan.js'

// riga della tabella PBI con una cella giocatore a scelta
const row = (rank, playerCell, pts) =>
  `<tr><td>${rank}</td><td>${playerCell}</td><td>24</td><td>158</td><td>108/50</td><td>68.4 %</td><td>655</td><td>437</td><td>+ 218</td><td>🏆 Vincitore - PBI 960</td><td>${pts}</td><td>▾</td></tr>`
const table = rs => `<html><body><table><thead><tr><th>#</th><th>Blader</th></tr></thead><tbody>${rs.join('')}</tbody></table><script>var x='<tr><td>1</td>'</script></body></html>`
const filler = n => Array.from({ length: n }, (_, i) => row(100 + i, `<a href="/giocatori/${9000 + i}">Riempitivo${i}</a>`, 10))

test('parser: nickname e team separati, id dal link', () => {
  const rows = parseRanking(table([
    row(1, '<a href="/giocatori/111"><span class="nick">Ivanbrando</span></a>', 4630),
    row(2, '<a href="/giocatori/222"><span>BBP_iamThanos</span></a><span class="team">Roasted Crab</span>', 4120),
    row(3, '<div><a href="/giocatori/333">SDM_Brus972</a><br><small>Swamp Dragons</small></div>', 3310),
    row(4, '<img src="a.png" alt=""><div>WB_Milaneitor</div><div class="t">West Bladers</div>', 2500),
    row(5, '<a href="/giocatori/555">Ale pugno di fuoco</a>', 20),
    row(6, '<a href="https://www.probladers.it/giocatori/666">Nikaカラス</a><span>Team &amp; Co</span>', 1835),
  ]))
  assert.deepEqual(rows.map(r => [r.rank, r.nick, r.team, r.pbiId, r.points]), [
    [1, 'Ivanbrando', null, '111', 4630],
    [2, 'BBP_iamThanos', 'Roasted Crab', '222', 4120],
    [3, 'SDM_Brus972', 'Swamp Dragons', '333', 3310],
    [4, 'WB_Milaneitor', 'West Bladers', null, 2500],
    [5, 'Ale pugno di fuoco', null, '555', 20],
    [6, 'Nikaカラス', 'Team & Co', '666', 1835],
  ])
})

test('parser: gli script e le righe di intestazione vengono ignorati', () => {
  assert.equal(parseRanking(table([row(1, '<a href="/giocatori/1">A</a>', 5)])).length, 1)
})

test('controlli: blocca letture incomplete o strane', () => {
  assert.ok(validateRanking([]).length)
  const ok = parseRanking(table([row(1, '<a href="/giocatori/1">A</a>', 5), ...filler(60)]))
  assert.deepEqual(validateRanking(ok), [])
  assert.ok(validateRanking(ok.map(r => ({ ...r, nick: '' }))).length)
})

const B = (id, nickname, extra = {}) => ({ id, nickname, pbi_nickname: null, pbi_id: null, pro_rank: null, ...extra })

test('abbinamento: originale + doppione "Nick Team" -> aggiorna l\'originale, il doppione esce', () => {
  const bl = [B('o', 'BBP_iamThanos', { pro_rank: 2 }), B('c', 'BBP_iamThanos Roasted Crab', { pro_rank: 2 })]
  const p = planSync(bl, [{ rank: 2, nick: 'BBP_iamThanos', team: 'Roasted Crab', pbiId: '222', points: 4120 }])
  assert.deepEqual(p.updates, [{ id: 'o', nickname: 'BBP_iamThanos', pro_rank: 2, pro_points: 4120, pbi_id: '222' }])
  assert.deepEqual(p.inserts, []); assert.deepEqual(p.renames, [])
  assert.deepEqual(p.clears.map(c => c.id), ['c'])
})

test('abbinamento: solo doppione senza originale -> viene rinominato', () => {
  const p = planSync([B('c', 'Zeta90 Team X', { pro_rank: 8 })], [{ rank: 8, nick: 'Zeta90', team: 'Team X', pbiId: '90', points: 2000 }])
  assert.deepEqual(p.renames, [{ id: 'c', from: 'Zeta90 Team X', nickname: 'Zeta90' }])
  assert.equal(p.updates[0].id, 'c'); assert.deepEqual(p.inserts, []); assert.deepEqual(p.clears, [])
})

test('abbinamento: per id PBI anche se il giocatore ha cambiato nome su PBI', () => {
  const p = planSync([B('k', 'Fourteenkay', { pbi_nickname: 'Krsto14', pbi_id: '7742966' })], [{ rank: 87, nick: 'Krsto14_NEW', team: null, pbiId: '7742966', points: 470 }])
  assert.equal(p.updates[0].id, 'k'); assert.deepEqual(p.inserts, [])
})

test('abbinamento: nickname PBI diverso da quello del team, maiuscole ignorate', () => {
  const p = planSync([B('k', 'Fourteenkay', { pbi_nickname: 'Krsto14' }), B('m', 'marcocarno')],
    [{ rank: 87, nick: 'KRSTO14', pbiId: '1', points: 470 }, { rank: 9, nick: 'MarcoCarno', team: 'Green Larios', pbiId: '2', points: 2120 }])
  assert.deepEqual(p.updates.map(u => u.id).sort(), ['k', 'm']); assert.deepEqual(p.inserts, [])
})

test('nuovo in top 10: creato una sola volta, con id PBI; righe ripetute ignorate', () => {
  const r = { rank: 4, nick: 'NuovoForte', team: 'Team', pbiId: '44', points: 3000 }
  const p = planSync([], [r, { ...r }, { rank: 50, nick: 'Lontano', pbiId: '50', points: 10 }])
  assert.deepEqual(p.inserts, [{ nickname: 'NuovoForte', pbi_id: '44', pro_rank: 4, pro_points: 3000 }])
})

test('omonimo con id PBI diverso: non sovrascrive e non crea doppioni', () => {
  const p = planSync([B('a', 'Ale', { pbi_id: '1', pro_rank: 3 })], [{ rank: 3, nick: 'Ale', pbiId: '2', points: 900 }])
  assert.deepEqual(p.updates, []); assert.deepEqual(p.inserts, []); assert.equal(p.skipped.length, 1)
})

test('chi esce dalla classifica perde la posizione; chi non era in classifica resta com\'è', () => {
  const p = planSync([B('x', 'Uscito', { pro_rank: 7 }), B('n', 'Nikkk')], [{ rank: 1, nick: 'Altro', pbiId: '1', points: 1 }])
  assert.deepEqual(p.clears.map(c => c.id), ['x'])
})

test('due aggiornamenti di fila: il secondo non crea né rinomina nulla (nessun clone futuro)', () => {
  let bl = [B('o', 'SDM_Brus972', { pro_rank: 4 }), B('c', 'SDM_Brus972 Swamp Dragons', { pro_rank: 4 }), B('z', 'Zeta90 Team X')]
  const rows = [
    { rank: 1, nick: 'Ivanbrando', team: null, pbiId: '111', points: 4630 },
    { rank: 4, nick: 'SDM_Brus972', team: 'Swamp Dragons', pbiId: '333', points: 3310 },
    { rank: 8, nick: 'Zeta90', team: 'Team X', pbiId: '90', points: 2000 },
  ]
  const apply = (bl, p) => {
    bl = bl.map(b => { const r = p.renames.find(x => x.id === b.id); return r ? { ...b, nickname: r.nickname } : b })
    bl = bl.map(b => { const u = p.updates.find(x => x.id === b.id); return u ? { ...b, pro_rank: u.pro_rank, pbi_id: u.pbi_id ?? b.pbi_id } : b })
    bl = bl.map(b => p.clears.some(c => c.id === b.id) ? { ...b, pro_rank: null } : b)
    return [...bl, ...p.inserts.map((i, k) => ({ id: 'new' + k, pbi_nickname: null, ...i }))]
  }
  const p1 = planSync(bl, rows); bl = apply(bl, p1)
  assert.deepEqual(p1.inserts.map(i => i.nickname), ['Ivanbrando'])
  assert.deepEqual(p1.renames.map(r => r.nickname), ['Zeta90'])
  const p2 = planSync(bl, rows); bl = apply(bl, p2)
  assert.deepEqual(p2.inserts, []); assert.deepEqual(p2.renames, []); assert.deepEqual(p2.clears, [])
  assert.equal(new Set(bl.map(b => b.nickname.toLowerCase())).size, bl.length)
  assert.ok(bl.filter(b => b.pro_rank != null).every(b => b.pbi_id), 'tutti i blader in classifica hanno l\'id PBI')
})
