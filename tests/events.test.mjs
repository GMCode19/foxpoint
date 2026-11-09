import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCalendar, parseEvent, planEvents, tierOf } from '../scripts/pbi-events.js'

const ld = o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`
const U = s => 'https://www.probladers.it/calendario-eventi/' + s
const calendar = ld({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [] }) + ld({
  '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: [
    { '@type': 'ListItem', position: 1, url: U('crowblade-10-11'), name: 'CrowBlade 10/11' },
    { '@type': 'ListItem', position: 2, url: U('bsbz-ranked-tappa-5'), name: 'BSBz Ranked - Tappa 5' },
    { '@type': 'ListItem', position: 3, url: U('pbi-team-tournament-14-11-2026'), name: 'PBI TEAM TOURNAMENT 14/11/2026' },
    { '@type': 'ListItem', position: 4, url: U('pbi-320-2000s-kids'), name: "PBI 320 - 2000's kids - 14/11/2026" },
    { '@type': 'ListItem', position: 5, url: U('pbi-960-madbadgers-15-11-2026'), name: 'PBI 960 - MadBadgers - 15/11/2026' },
    { '@type': 'ListItem', position: 6, url: U('beerblade-ranked'), name: 'PBI 320 - CHIMERA TYPHOON - 15/11/2026' },
    { '@type': 'ListItem', position: 7, url: U('pbi-960-madbadgers-15-11-2026'), name: 'doppione' },
    { '@type': 'ListItem', position: 8, url: 'https://altro-sito.it/pbi-320', name: 'PBI 320 - fuori sito' },
  ] })
const event = (o = {}) => '<html><head>' + ld({ '@type': 'SportsOrganization', name: 'Pro Bladers Italia' }) + ld({
  '@context': 'https://schema.org', '@type': 'SportsEvent', name: "PBI 320 - 2000's kids - 14/11/2026", url: U('pbi-320-2000s-kids'),
  startDate: '2026-11-14T15:00:00.000Z',
  description: "Torneo ranked Beyblade X PBI 320 a MASSA il 14 novembre 2026 alle 16:00. Organizzato da 2000's Kids presso Crazy Willy.",
  eventStatus: 'https://schema.org/EventScheduled',
  location: { '@type': 'Place', name: 'Crazy Willy', address: { '@type': 'PostalAddress', streetAddress: 'Lungomare di Levante, 54100 Massa, Italia' } },
  organizer: { '@type': 'SportsClub', name: "2000's Kids" }, ...o }) + '</head><body><script type="application/ld+json">{rotto</script></body></html>'
const NOW = new Date('2026-11-09T15:00:00Z')

test('calendario: solo eventi "PBI <tier>" del sito, senza doppioni', () => {
  assert.deepEqual(parseCalendar(calendar).map(e => e.url), [U('pbi-320-2000s-kids'), U('pbi-960-madbadgers-15-11-2026'), U('beerblade-ranked')])
  assert.deepEqual(parseCalendar('<html>niente</html>'), [])
})

test('tier dal nome', () => {
  assert.equal(tierOf('PBI 960 - MadBadgers'), '960')
  assert.equal(tierOf('PBI 999 - inventato'), null)
  assert.equal(tierOf('PBI Masters Milano'), 'masters')
  assert.equal(tierOf('Grande Slam PBI'), 'slam')
  assert.equal(tierOf('PBI TEAM TOURNAMENT'), null)
})

test('evento: nome senza data, ora esatta, club e città', () => {
  assert.deepEqual(parseEvent(event(), U('pbi-320-2000s-kids'), NOW), {
    name: "PBI 320 - 2000's kids", tier: '320', starts_at: '2026-11-14T15:00:00.000Z', club: "2000's Kids", city: 'Massa', url: U('pbi-320-2000s-kids'),
  })
  const c = parseEvent(event({ name: 'PBI 960 - MadBadgers - 15/11/2026', description: 'Torneo ranked Beyblade X PBI 960 a COLOGNO MONZESE il 15 novembre 2026 alle 13:00.' }), U('x'), NOW)
  assert.equal(c.city, 'Cologno Monzese'); assert.equal(c.tier, '960')
  const a = parseEvent(event({ description: 'Torneo ranked PBI 320.' }), U('x'), NOW)
  assert.equal(a.city, 'Massa', 'città dall\'indirizzo se manca nella descrizione')
})

test('evento: si scartano passati, annullati, non ranked e pagine senza dati', () => {
  assert.match(parseEvent(event({ startDate: '2026-11-01T15:00:00Z' }), U('x'), NOW).skip, /iniziato/)
  assert.match(parseEvent(event({ eventStatus: 'https://schema.org/EventCancelled' }), U('x'), NOW).skip, /annullato/)
  assert.match(parseEvent(event({ name: 'PBI 320 open', description: 'Torneo open, non valido per il ranking.' }), U('x'), NOW).skip, /ranked/)
  assert.match(parseEvent(event({ startDate: 'boh' }), U('x'), NOW).skip, /data/)
  assert.match(parseEvent('<html></html>', U('x'), NOW).skip, /non trovati/)
})

test('piano: inserisce i nuovi, corregge gli ufficiali cambiati, non tocca quelli dei team', () => {
  const f = parseEvent(event(), U('pbi-320-2000s-kids'), NOW)
  const g = { ...f, url: U('b'), name: 'PBI 960 - B', tier: '960' }
  const h = { ...f, url: U('c'), name: 'PBI 320 - C' }
  const existing = [
    { id: 1, ...f, starts_at: '2026-11-14T15:00:00+00:00', created_by_team: null },      // identico
    { id: 2, ...g, starts_at: '2026-11-15T12:00:00Z', created_by_team: null },             // orario cambiato
    { id: 3, ...h, city: 'Altrove', created_by_team: 'team-1' },                           // inserito a mano
  ]
  const p = planEvents(existing, [f, { ...g, starts_at: '2026-11-15T13:00:00.000Z' }, h, { ...f, url: U('nuovo'), name: 'PBI 480 - Nuovo' }])
  assert.deepEqual(p.inserts.map(t => t.name), ['PBI 480 - Nuovo'])
  assert.deepEqual(p.updates, [{ id: 2, name: 'PBI 960 - B', starts_at: '2026-11-15T13:00:00.000Z' }])
  assert.equal(p.skipped.length, 1)
})
