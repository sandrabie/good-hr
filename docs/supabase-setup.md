# Konfiguracja Supabase dla GoodHR Workbench

## 1. Zmienne środowiskowe na Vercel

W projekcie Vercel dodaj:

- `SUPABASE_URL` - adres projektu, np. `https://xxxxx.supabase.co`
- `SUPABASE_ANON_KEY` - publiczny anon key z Supabase

Po dodaniu zmiennych wykonaj ponowny deploy.

## 2. Tabela workspace

W Supabase otwórz SQL Editor i uruchom:

```sql
create table if not exists public.goodhr_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.goodhr_workspaces enable row level security;

create policy "Users can read own workspace"
on public.goodhr_workspaces
for select
using (auth.uid() = user_id);

create policy "Users can insert own workspace"
on public.goodhr_workspaces
for insert
with check (auth.uid() = user_id);

create policy "Users can update own workspace"
on public.goodhr_workspaces
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

## 3. Jak działa zapis

Supabase Auth obsługuje rejestrację i logowanie. Aplikacja zapisuje cały workspace użytkownika w tabeli `goodhr_workspaces`, w wierszu przypisanym do `auth.uid()`. Dzięki politykom RLS użytkownik może odczytać i aktualizować wyłącznie własne ankiety, projekty, raporty i szablony importu.

## 4. Linki potwierdzające e-mail

W Supabase ustaw przekierowanie dla linków z wiadomości e-mail:

1. Wejdź w **Authentication** -> **URL Configuration**.
2. Ustaw **Site URL** na:

```text
https://goodhr-workbench.vercel.app
```

3. W **Redirect URLs** dodaj:

```text
https://goodhr-workbench.vercel.app/**
```

Jeśli chcesz testować wersje preview z Vercel, dodaj też redirect dla preview deploymentów. Supabase obsługuje wildcardy w redirect URL, ale dla produkcji najbezpieczniejszy jest dokładny adres aplikacji.

## 5. Limit wysyłki maili aktywacyjnych

Domyślny provider e-mail w Supabase ma niski limit i służy głównie do testów. Jeśli zobaczysz komunikat `email rate limit exceeded`, masz trzy wyjścia:

- poczekać i spróbować ponownie później,
- na czas testów wyłączyć wymóg potwierdzania e-maila w **Authentication** -> **Providers** -> **Email**,
- skonfigurować własny SMTP w Supabase, jeśli aplikacja ma być używana produkcyjnie lub przez więcej osób.
