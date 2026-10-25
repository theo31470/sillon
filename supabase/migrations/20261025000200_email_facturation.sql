-- E-mails liés à l'abonnement (activation, fin d'essai, paiements, résiliation).
alter table public.email_log drop constraint if exists email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('compte', 'rappel', 'annonce', 'test', 'facturation'));
