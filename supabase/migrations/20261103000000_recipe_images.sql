-- A photo for each recipe. The image itself lives in a public Storage bucket, so the app loads it straight from a URL
-- with no function call and no AI. `image_credit` is the photographer or source when the photo's license asks for it.
-- Both are optional: a recipe with no photo simply shows none.
alter table public.recipes
  add column if not exists image_url text,
  add column if not exists image_credit text;

-- Public read, so a photo needs no sign-in to load. Nothing here lets the app write to it: uploads go through the
-- service role (supabase/scripts/upload-recipe-images.ts), which bypasses these policies.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-images', 'recipe-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
