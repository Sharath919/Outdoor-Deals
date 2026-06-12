create table tracked_products (
  asin text primary key,
  product_name text not null,
  image_url text,
  current_price numeric(10,2),
  previous_price numeric(10,2),
  currency text default 'USD',
  priority int not null default 3,
  last_checked timestamptz,
  consecutive_failures int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table price_watches (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  asin text not null references tracked_products(asin),
  product_name text not null,
  price_at_watch numeric(10,2) not null,
  article_slug text,
  status text not null default 'pending_confirm',
  confirm_token uuid not null default gen_random_uuid(),
  unsubscribe_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  notified_at timestamptz
);

create table price_history (
  id bigint generated always as identity primary key,
  asin text not null references tracked_products(asin),
  price numeric(10,2) not null,
  captured_at timestamptz not null default now()
);

create index idx_watches_asin_status on price_watches(asin, status);
create index idx_watches_email on price_watches(email);
create index idx_history_asin_time on price_history(asin, captured_at desc);
create index idx_tracked_priority on tracked_products(priority, last_checked) where active = true;
create unique index idx_watch_dedupe on price_watches(email, asin) where status in ('pending_confirm','active');
