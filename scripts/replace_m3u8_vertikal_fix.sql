-- Erstatter HLS (.m3u8) URL'er med MP4-URL'er i ALLE tekst/json/jsonb-kolonner i public-schemaet.
-- Kører i én transaktion (ét statement) og returnerer en oversigt over hvad der blev ændret.
create temp table _replace_log (tbl text, col text, rows_changed int) on commit drop;

do $$
declare
  pairs text[][] := array[
    ['https://res.cloudinary.com/dq6jxbyrg/video/upload/sp_auto/flamingo_tours_-_vertikal.m3u8',
     'https://res.cloudinary.com/epjomksm/video/upload/flamingo_tours_-_vertikal--fs.mp4']
  ];
  r record;
  i int;
  expr text;
  n int;
begin
  for r in
    select c.table_name, c.column_name, c.data_type
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.table_name not like '%backup%'
      and c.data_type in ('text', 'character varying', 'json', 'jsonb')
      and c.is_generated = 'NEVER'
  loop
    -- byg nested replace() på kolonnen (som text)
    expr := case when r.data_type in ('json','jsonb') then format('%I::text', r.column_name)
                 else format('%I', r.column_name) end;
    for i in 1 .. array_length(pairs, 1) loop
      expr := format('replace(%s, %L, %L)', expr, pairs[i][1], pairs[i][2]);
    end loop;
    if r.data_type in ('json','jsonb') then
      expr := format('(%s)::%s', expr, r.data_type);
    end if;

    execute format(
      'update public.%I set %I = %s where %I::text ~ %L',
      r.table_name, r.column_name, expr, r.column_name, 'sp_auto/[^"/ ]+\.m3u8'
    );
    get diagnostics n = row_count;
    if n > 0 then
      insert into _replace_log values (r.table_name, r.column_name, n);
    end if;
  end loop;
end $$;

select * from _replace_log;
