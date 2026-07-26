-- Порция 5: учётки и первый вход
alter table profiles add column if not exists must_change_password boolean not null default false;
alter table profiles add column if not exists onboarded_at timestamptz;

-- Админ должен видеть и править чужие профили (создание идёт служебным ключом,
-- но список и правки в интерфейсе работают от имени админа)
drop policy if exists profiles_admin_all on profiles;
create policy profiles_admin_all on profiles for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Каждый может менять свой профиль (в т.ч. снять must_change_password после смены пароля)
drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
