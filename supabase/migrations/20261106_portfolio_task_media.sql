-- ============================================================================
-- Portfolio: én række = én opgave med flere medier
-- ============================================================================
--
-- Kør hele filen i Supabase → SQL Editor (én gang). Hele scriptet kører i én
-- transaktion: går noget galt, bliver intet ændret.
--
-- Hvad den gør
--   1. Tager backup af portfolio_images og portfolio_bundles
--      (portfolio_images_backup_20261106 / portfolio_bundles_backup_20261106,
--       RLS slået til uden policies, så de ikke kan læses udefra).
--   2. Tilføjer to kolonner til portfolio_images:
--        media           jsonb   liste af {"id": "...", "url": "..."}
--                                url bruger samme præfikser som i dag:
--                                  https://...        billede
--                                  panorama:https://  360°
--                                  youtube:ID         YouTube-video
--                                  cloudinary:ID      Cloudinary-video
--        cover_media_id  text    id på det billede der vises som cover
--   3. Almindelige rækker (uden bundle) → media = [det ene medie],
--      cover = billedet (hvis det er et billede).
--   4. Hver bundle samles til ÉN opgave:
--        titel               = bundlens navn
--        beskrivelse/logo/
--        hjemmeside          = første række i bundlen der har en
--        media               = alle bundlens medier i den gamle rækkefølge
--        cover               = første almindelige billede
--        rækkefølge (array)  = den højeste i bundlen (samme placering som før)
--        likes/dislikes      = summeres
--      De øvrige rækker i bundlen slettes (de ligger i backup-tabellen).
--   5. image_url på hver opgave sættes til coveret (ellers første medie), så
--      søgning, Meilisearch og AI-forslag stadig virker uændret.
--
-- portfolio_bundles-tabellen røres ikke (bundle_id nulstilles på opgaverne).
--
-- Rollback (hvis du fortryder):
--   begin;
--   delete from portfolio_images;
--   insert into portfolio_images (...kolonner uden media/cover_media_id...)
--     select ... from portfolio_images_backup_20261106;
--   commit;
--   (alter table portfolio_images drop column media, drop column cover_media_id;)
-- ============================================================================

begin;

-- 1. Backup --------------------------------------------------------------------

create table if not exists portfolio_images_backup_20261106 as
  table portfolio_images;
create table if not exists portfolio_bundles_backup_20261106 as
  table portfolio_bundles;

alter table portfolio_images_backup_20261106 enable row level security;
alter table portfolio_bundles_backup_20261106 enable row level security;

-- 2. Nye kolonner ----------------------------------------------------------------

alter table portfolio_images
  add column if not exists media jsonb not null default '[]'::jsonb,
  add column if not exists cover_media_id text;

alter table portfolio_images
  drop constraint if exists portfolio_images_media_is_array;
alter table portfolio_images
  add constraint portfolio_images_media_is_array
  check (jsonb_typeof(media) = 'array');

-- 3. Almindelige rækker (ikke i en bundle) ------------------------------------------

with src as (
  select id, gen_random_uuid()::text as mid, image_url
  from portfolio_images
  where bundle_id is null
    and image_url is not null
    and btrim(image_url) <> ''
    and media = '[]'::jsonb
)
update portfolio_images p
set media = jsonb_build_array(jsonb_build_object('id', s.mid, 'url', s.image_url)),
    cover_media_id = case
      when s.image_url ~ '^(panorama|youtube|cloudinary):' then null
      else s.mid
    end
from src s
where p.id = s.id;

-- 4. Bundles → én opgave pr. bundle ---------------------------------------------------

-- Hjælpefunktion til sortering: virker uanset kolonnens type (int, numeric, text …).
-- Værdier der ikke er tal (fx NULL) bliver til standardværdien.
create or replace function pg_temp.pf_num(v text, dflt numeric default 0)
returns numeric language sql immutable as $$
  select case when v ~ '^-?[0-9]+(\.[0-9]+)?$' then v::numeric else dflt end
$$;

create temp table _pf_bundle_agg on commit drop as
with ordered as (
  select
    pi.id,
    pi.bundle_id,
    pi.title,
    pi.description,
    pi.image_url,
    pi.business_logo_url,
    pi.business_website_url,
    coalesce(pi.likes, 0)    as likes,
    coalesce(pi.dislikes, 0) as dislikes,
    gen_random_uuid()::text  as mid,
    row_number() over (
      partition by pi.bundle_id
      order by pg_temp.pf_num(pi.sort_order::text), pi.created_at, pi.id
    ) as rn_media,
    row_number() over (
      partition by pi.bundle_id
      order by pg_temp.pf_num(pi."array"::text, 50) desc, pg_temp.pf_num(pi.sort_order::text), pi.created_at, pi.id
    ) as rn_keeper
  from portfolio_images pi
  where pi.bundle_id is not null
    and pi.image_url is not null
    and btrim(pi.image_url) <> ''
)
select
  o.bundle_id,
  (array_agg(o.id order by o.rn_keeper))[1]                       as keeper_id,
  jsonb_agg(jsonb_build_object('id', o.mid, 'url', o.image_url)
            order by o.rn_media)                                   as media,
  (array_agg(o.mid order by o.rn_media)
     filter (where o.image_url !~ '^(panorama|youtube|cloudinary):'))[1]
                                                                   as cover_media_id,
  (array_agg(o.image_url order by o.rn_media)
     filter (where o.image_url !~ '^(panorama|youtube|cloudinary):'))[1]
                                                                   as first_image_url,
  (array_agg(o.image_url order by o.rn_media))[1]                  as first_media_url,
  (array_agg(o.description order by o.rn_media)
     filter (where nullif(btrim(o.description), '') is not null))[1]
                                                                   as description,
  (array_agg(o.business_logo_url order by o.rn_media)
     filter (where nullif(btrim(o.business_logo_url), '') is not null))[1]
                                                                   as business_logo_url,
  (array_agg(o.business_website_url order by o.rn_media)
     filter (where nullif(btrim(o.business_website_url), '') is not null))[1]
                                                                   as business_website_url,
  (array_agg(o.title order by o.rn_keeper))[1]                     as fallback_title,
  sum(o.likes)::int                                                as likes,
  sum(o.dislikes)::int                                             as dislikes
from ordered o
group by o.bundle_id;

-- Slet bundlens øvrige rækker (alt ligger i media + backup-tabellen).
delete from portfolio_images
where bundle_id in (select bundle_id from _pf_bundle_agg)
  and id not in (select keeper_id from _pf_bundle_agg);

-- Opdatér den række der bliver tilbage som opgave.
update portfolio_images p
set title                = coalesce(nullif(btrim(b.name), ''), a.fallback_title, p.title),
    description          = a.description,
    business_logo_url    = a.business_logo_url,
    business_website_url = a.business_website_url,
    media                = a.media,
    cover_media_id       = a.cover_media_id,
    image_url            = coalesce(a.first_image_url, a.first_media_url, p.image_url),
    likes                = a.likes,
    dislikes             = a.dislikes,
    image_name           = null,
    bundle_id            = null
from _pf_bundle_agg a
left join portfolio_bundles b on b.id = a.bundle_id
where p.id = a.keeper_id;

-- 5. Sanity-tjek: ingen opgave uden medier -----------------------------------------------
do $$
declare
  empty_count int;
begin
  select count(*) into empty_count
  from portfolio_images
  where media = '[]'::jsonb
    and image_url is not null
    and btrim(image_url) <> '';
  if empty_count > 0 then
    raise exception 'Migration afbrudt: % opgave(r) fik ingen medier', empty_count;
  end if;
end $$;

commit;

-- Efterkontrol (valgfri):
--   select id, title, jsonb_array_length(media) as antal_medier, cover_media_id
--   from portfolio_images order by created_at desc;
