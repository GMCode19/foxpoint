import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planBounties } from '../scripts/pbi-bounties.js'

const T = 'team'
const slots = new Map([[T, new Map([[1, 250], [2, 200], [3, 175], ...[4, 5, 6, 7, 8, 9, 10].map(r => [r, 100])])]])
const B = (target, category, value, active = true, extra = {}) => ({ id: 'b-' + target, team_id: T, target_id: target, category, value, active, prev_category: null, prev_value: null, ...extra })
const plan = (bs, oldR, newR) => planBounties(bs, new Map(Object.entries(oldR)), new Map(Object.entries(newR)), slots)

test('sorpasso: MajinPi sale al 2° e prende 200, BBP scende al 3° e prende 175', () => {
  const ups = plan([B('ivan', 'top10', 250), B('majin', 'top10', 175), B('bbp', 'top10', 200)],
    { ivan: 1, majin: 3, bbp: 2 }, { ivan: 1, majin: 2, bbp: 3 })
  assert.deepEqual(ups, [{ id: 'b-majin', target_id: 'majin', value: 200 }, { id: 'b-bbp', target_id: 'bbp', value: 175 }])
})

test('nessun cambiamento: nessuna scrittura', () => {
  assert.deepEqual(plan([B('ivan', 'top10', 250)], { ivan: 1 }, { ivan: 1 }), [])
})

test('nuovo in top 10 (taglia appena creata a 0, non attiva): prende il valore e si attiva', () => {
  assert.deepEqual(plan([B('nuovo', 'top10', 0, false)], {}, { nuovo: 7 }), [{ id: 'b-nuovo', target_id: 'nuovo', value: 100, active: true }])
})

test('chi esce dalla top 10 viene disattivato, valore invariato', () => {
  assert.deepEqual(plan([B('aes', 'top10', 100)], { aes: 9 }, { aes: 14 }), [{ id: 'b-aes', target_id: 'aes', active: false }])
  assert.deepEqual(plan([B('aes', 'top10', 100)], { aes: 9 }, {}), [{ id: 'b-aes', target_id: 'aes', active: false }], 'sparito dalla classifica')
})

test("l'admin ha disattivato uno della top 10: resta disattivato", () => {
  assert.deepEqual(plan([B('x', 'top10', 100, false)], { x: 5 }, { x: 4 }), [])
})

test('un "rilevante" entra in top 10 e poi esce: torna rilevante col suo valore', () => {
  const [enter] = plan([B('zenoby', 'rilevante', 50)], { zenoby: 11 }, { zenoby: 9 })
  assert.deepEqual(enter, { id: 'b-zenoby', target_id: 'zenoby', category: 'top10', prev_category: 'rilevante', prev_value: 50, value: 100 })
  const [leave] = plan([B('zenoby', 'top10', 100, true, { prev_category: 'rilevante', prev_value: 50 })], { zenoby: 9 }, { zenoby: 12 })
  assert.deepEqual(leave, { id: 'b-zenoby', target_id: 'zenoby', category: 'rilevante', value: 50, prev_category: null, prev_value: null })
})

test('posizione senza valore impostato: valore lasciato com\'è', () => {
  const s = new Map([[T, new Map([[1, 250]])]])
  assert.deepEqual(planBounties([B('y', 'top10', 80)], new Map([['y', 3]]), new Map([['y', 2]]), s), [])
})

test('capi team e rilevanti fuori dalla top 10 non vengono toccati', () => {
  assert.deepEqual(plan([B('mimmo', 'capo', 50), B('dark', 'rilevante', 60, false)], { mimmo: 103, dark: 30 }, { mimmo: 98, dark: 25 }), [])
})

test('Fox Blader entra in top 10 PBI: prende la taglia Top 10 e quando esce torna Fox col suo valore', () => {
  const [enter] = plan([B('marco', 'fox', 30)], { marco: 12 }, { marco: 9 })
  assert.deepEqual(enter, { id: 'b-marco', target_id: 'marco', category: 'top10', prev_category: 'fox', prev_value: 30, value: 100 })
  const [leave] = plan([B('marco', 'top10', 100, true, { prev_category: 'fox', prev_value: 30 })], { marco: 9 }, { marco: 14 })
  assert.deepEqual(leave, { id: 'b-marco', target_id: 'marco', category: 'fox', value: 30, prev_category: null, prev_value: null })
})
