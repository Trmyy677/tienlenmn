-- Chạy toàn bộ file này trong Supabase > SQL Editor
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  player_count int not null check (player_count between 2 and 4),
  winner_nick text,
  created_at timestamptz not null default now()
);

create table if not exists match_players (
  id bigint generated always as identity primary key,
  match_id uuid not null references matches(id) on delete cascade,
  nickname text not null,
  cards_left int not null,
  score int not null,
  is_winner boolean not null default false
);
create index if not exists match_players_nick_idx on match_players(nickname);
create index if not exists match_players_match_idx on match_players(match_id);

-- Bật RLS và KHÔNG tạo policy: client không truy cập trực tiếp được.
-- Chỉ server dùng service_role key (bỏ qua RLS) để ghi/đọc.
alter table matches enable row level security;
alter table match_players enable row level security;

create or replace view leaderboard with (security_invoker = true) as
select nickname,
       count(*)                         as games,
       count(*) filter (where is_winner) as wins,
       sum(score)                       as total_score
from match_players
group by nickname
order by total_score desc
limit 50;
