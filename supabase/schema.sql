-- Chạy toàn bộ file này trong Supabase > SQL Editor (chạy lại nhiều lần vẫn an toàn)
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  player_count int not null check (player_count between 2 and 4),
  winner_nick text,
  bet int not null default 0,
  created_at timestamptz not null default now()
);
alter table matches add column if not exists bet int not null default 0;

create table if not exists match_players (
  id bigint generated always as identity primary key,
  match_id uuid not null references matches(id) on delete cascade,
  nickname text not null,
  cards_left int not null,
  score bigint not null,          -- coin thắng/thua trong ván
  is_winner boolean not null default false
);
create index if not exists match_players_nick_idx on match_players(nickname);
create index if not exists match_players_match_idx on match_players(match_id);

-- Hồ sơ người chơi (khoá = SHA-256 của token thiết bị, không lưu token thô)
create table if not exists profiles (
  token_hash text primary key,
  nickname text not null,
  coins bigint not null default 1000,
  streak int not null default 0,
  last_checkin date,
  checkins int not null default 0,
  games int not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  cong int not null default 0,
  heo_chat int not null default 0,
  heo_bi_chat int not null default 0,
  bomb_de int not null default 0,
  win_streak int not null default 0,
  best_streak int not null default 0,
  max_win bigint not null default 0,
  coin_won bigint not null default 0,
  coin_lost bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists profiles_coins_idx on profiles(coins desc);

drop view if exists leaderboard; -- bản cũ, nay dùng bảng profiles

-- RLS bật, không có policy: chỉ server (service_role) truy cập được
alter table matches enable row level security;
alter table match_players enable row level security;
alter table profiles enable row level security;
