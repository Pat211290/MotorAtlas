-- Persist the complete adaptive brand palette, not only primary/dark colors.
alter table public.workshops
  add column if not exists brand_soft text,
  add column if not exists brand_rgb text;

-- Backfill existing MotorAtlas workshop branding. Future uploads persist these values directly.
update public.workshops
set brand_soft = case
      when brand_primary = '#993037' then '#f0e8e9'
      else brand_soft
    end,
    brand_rgb = case
      when brand_primary = '#993037' then '153,48,55'
      else brand_rgb
    end
where brand_primary is not null
  and (brand_soft is null or brand_rgb is null);
