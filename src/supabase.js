import { createClient } from '@supabase/supabase-js'
// URL e chiave pubblica (publishable): sicure nel codice, i dati sono protetti dalle RLS.
export const supabase = createClient(
  'https://udjviairelbvohdfwhhb.supabase.co',
  'sb_publishable_f62bimhQdn81Xsd2TiHGYg_idA-GlHz'
)
