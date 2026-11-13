-- FOX POINT - 00 RESET
-- ATTENZIONE: cancella TUTTE le tabelle e i dati di Fox Point (team, blader, taglie, ranked, punti).
-- Gli utenti creati in Authentication > Users NON vengono toccati.
-- Eseguilo solo se vuoi ripartire da zero, poi esegui 01, 02 e 03 nell'ordine.

drop view if exists leaderboard;
drop table if exists push_queue, push_subscriptions, push_config, bounty_rank_values, blader_photos, tournament_entries, tournaments, ranked_tier_points, ranked_tiers,
                     join_requests, points_ledger, claims, bounty_value_history,
                     bounties, seasons, team_members, bladers, teams cascade;

drop function if exists current_blader_id, my_team_ids, is_team_admin, is_any_admin,
  request_join, approve_join, reject_join, claims_before_insert, bounty_history,
  decide_claim, admin_register_claim, revoke_claim, adjust_points, delete_adjustment,
  link_blader_on_signup, ranked_points_for, phase_label, _is_active_member,
  ranked_join, ranked_leave, _ranked_set_result, ranked_report, ranked_decide,
  ranked_admin_register, ranked_revoke, keep_one_admin,
  my_admin_team_ids, set_blader_photo, remove_blader_photo, bounty_rank_value_sync,
  push_public_key, push_test, push_enqueue, push_wake, push_on_claim, push_on_entry, push_on_join, push_on_tournament, push_on_points,
  _nick, _team_admins, _team_members,
  fox_value, fox_rank, fox_sync, fox_sync_ledger, fox_sync_member, _approve_claim, respond_claim, set_avatar cascade;

-- regole di accesso alle foto (i file nello spazio "foto-bersagli" restano: si cancellano da Storage)
drop policy if exists "foto-bersagli lettura team" on storage.objects;
drop policy if exists "foto-bersagli caricamento admin" on storage.objects;
drop policy if exists "foto-bersagli modifica admin" on storage.objects;
drop policy if exists "foto-bersagli eliminazione admin" on storage.objects;
