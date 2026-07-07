-- Private bucket for worker debug artifacts (failure screenshots).
-- No user policies: service-role access only.
insert into storage.buckets (id, name, public) values ('artifacts', 'artifacts', false);
