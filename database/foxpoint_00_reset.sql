-- FOX POINT - 00 RESET
-- ATTENZIONE: cancella TUTTE le tabelle e i dati di Fox Point (team, blader, taglie, ranked, punti).
-- Gli utenti creati in Authentication > Users NON vengono toccati.
-- Eseguilo solo se vuoi ripartire da zero, poi esegui 01, 02 e 03 nell'ordine.

drop view if exists leaderboard;
drop table if exists tournament_entries, tournaments, ranked_tier_points, ranked_tiers,
                     join_requests, points_ledger, claims, bounty_value_history,
                     bounties, seasons, team_members, bladers, teams cascade;

drop function if exists current_blader_id, my_team_ids, is_team_admin, is_any_admin,
  request_join, approve_join, reject_join, claims_before_insert, bounty_history,
  decide_claim, admin_register_claim, revoke_claim, adjust_points, delete_adjustment,
  link_blader_on_signup, ranked_points_for, phase_label, _is_active_member,
  ranked_join, ranked_leave, _ranked_set_result, ranked_report, ranked_decide,
  ranked_admin_register, ranked_revoke, keep_one_admin cascade;
