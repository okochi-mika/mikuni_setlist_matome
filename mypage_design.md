# マイページ機能 設計書

対象サイト: 下川みくに Live Archive Log
方式: Supabase（Postgres + Auth + RLS）
ログイン方式: メールのマジックリンク（パスワード不要）
機能範囲: お気に入りの曲 / 行ったライブの記録 / 表示名 / マイセトリ（自作セットリスト）

---

## 1. 全体構成

```
[index.html]  一覧・検索（既存）＋ ヘッダーにログイン状態表示
     │
     ├─ 各ライブカードに「参加した」ボタンを追加
     │
[player.html] 再生・セットリスト（既存）
     │
     ├─ 各曲の横に♡（お気に入り）ボタンを追加
     │
[login.html]  新規：メールアドレス入力 → マジックリンク送信
     │
[mypage.html] 新規：表示名／お気に入り曲一覧／参加ライブ一覧／マイセトリ／ログアウト
     │
[myplayer.html] 新規：マイセトリの再生
     │
     └─ Supabase（Auth + Postgres, RLS）
```

Supabaseはユーザー認証とデータの保存のみを担当。ページのホスティング自体は今まで通り（MAMP／今後の本番デプロイ先）。

---

## 2. 認証フロー（マジックリンク）

1. `login.html` でメールアドレスを入力
2. `supabase.auth.signInWithOtp({ email })` を呼ぶ
3. Supabaseがログイン用リンク付きメールを送信
4. ユーザーがメール内リンクをクリック → サイトに戻ってきてセッション確立
5. 以後 `supabase.auth.getSession()` でログイン状態を判定し、ヘッダーに表示名（未設定ならメールアドレス）、「マイページ」「ログアウト」を表示

Supabase側の設定でSite URL／Redirect URLを本番ドメイン（今はローカルなので `http://localhost:8888/...`）に登録しておく必要がある。

---

## 3. テーブル設計

ユーザー本体は Supabase 標準の `auth.users` をそのまま利用する。表示名は新規テーブルを作らず、Supabase Authの `user_metadata`（`display_name`）に保存している（`sb.auth.updateUser({ data: { display_name } })`）。

### 3-1. `favorites`（お気に入りの曲）

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid, PK, default `gen_random_uuid()` | |
| user_id | uuid, NOT NULL, references `auth.users(id)` | |
| song_title | text, NOT NULL | 曲名の代表表記（表記ゆれ統一ロジックと揃える） |
| created_at | timestamptz, default `now()` | |

`unique (user_id, song_title)` で同じ曲を重複登録できないようにする。

### 3-2. `attended_lives`（行ったライブの記録）

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid, PK, default `gen_random_uuid()` | |
| user_id | uuid, NOT NULL, references `auth.users(id)` | |
| live_id | text, NOT NULL | `data/YYYYMMDD.json` の `liveId` と一致させる（例: `"20260328"`） |
| created_at | timestamptz, default `now()` | |

`unique (user_id, live_id)` で同じライブを重複登録できないようにする。

### SQL（Supabase SQL Editorにそのまま貼れる想定・一本化版）

テーブル作成・RLS有効化・ポリシー・権限付与（GRANT）・PostgRESTのスキーマキャッシュ更新までをまとめてある。GRANTが漏れると「permission denied for table ...」、キャッシュ更新が漏れるとGRANT直後だけ反映されないことがあるため、この順番で一括実行するのが安全。

```sql
-- 既存のテーブルをリセット（データが空の場合のみ安全）
drop table if exists public.favorites cascade;
drop table if exists public.attended_lives cascade;

-- テーブル作成
create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  song_title text not null,
  created_at timestamptz not null default now(),
  unique (user_id, song_title)
);

create table public.attended_lives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  live_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, live_id)
);

-- RLS有効化
alter table public.favorites enable row level security;
alter table public.attended_lives enable row level security;

-- RLSポリシー（自分のデータしか読み書きできない）
create policy "select own favorites" on public.favorites for select using (auth.uid() = user_id);
create policy "insert own favorites" on public.favorites for insert with check (auth.uid() = user_id);
create policy "delete own favorites" on public.favorites for delete using (auth.uid() = user_id);

create policy "select own attended_lives" on public.attended_lives for select using (auth.uid() = user_id);
create policy "insert own attended_lives" on public.attended_lives for insert with check (auth.uid() = user_id);
create policy "delete own attended_lives" on public.attended_lives for delete using (auth.uid() = user_id);

-- テーブルへのアクセス権限（GRANT）。RLSは「権限があるロールをさらに行単位で絞る」仕組みなので、
-- これがないと RLS ポリシーがあっても permission denied になる。
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.favorites to authenticated;
grant select, insert, update, delete on public.attended_lives to authenticated;

-- PostgRESTのスキーマキャッシュを更新（これをやらないと直後だけ反映されないことがある）
NOTIFY pgrst, 'reload schema';
```

これで、ログインユーザーAがユーザーBのお気に入りやライブ記録を読み書きすることはSupabase側で強制的にブロックされる（アプリのコードにバグがあっても漏れない）。

---

## 4. 画面構成（お気に入り／参加記録／表示名）

### 4-1. `index.html`（既存に追加）
- ヘッダー右上：未ログイン時「ログイン」リンク → `login.html`、ログイン時 表示名（またはメールアドレス）＋「マイページ」リンク
- 各ライブカードに「参加した」ボタンを追加（未ログイン時はクリックでログインを促す）
  - ボタン押下 → `attended_lives` にinsert（すでに登録済みならdeleteでトグル）
  - `?song=曲名` で来た場合は自動でその曲の絞り込みを実行

### 4-2. `player.html`（既存に追加）
- セットリスト各曲の右側に♡ボタンを追加
  - 押下 → `favorites` にinsert/delete（トグル）

### 4-3. `login.html`（新規）
- メールアドレス入力フォーム＋送信ボタン
- 送信後「メールを確認してください」の案内表示

### 4-4. `mypage.html`（新規）
- 「表示名」セクション：`user_metadata.display_name` を編集・保存
- 「お気に入りの曲」セクション：`favorites` を曲名で一覧表示。クリックで `index.html?song=曲名` に遷移し絞り込み表示
- 「行ったライブの記録」セクション：`attended_lives` の `live_id` から `data/{live_id}.json` を取得しタイトル・日付を表示。`player.html?id=...` に遷移
- 「マイセトリ」セクション（8章参照）
- ログアウトボタン

---

## 5. データ連携メモ

- 曲名のキーは `js/songUtils.js` の `normalizeTitle` / `dedupeKey` を各ページで共通利用し、表記ゆれ（全角/半角チルダ・大小文字・空白）を無視して同じ曲として扱う。`favorites.song_title` にはこの正規化後の代表表記を保存する。
- `live_id` は既存の `data/*.json` の `liveId` フィールド・ファイル名と完全に一致させる。

---

## 6. 実装フェーズで必要になるもの

1. Supabaseプロジェクトを作成（無料枠でOK）
2. Authでメールのマジックリンクを有効化し、Site URL / Redirect URLを設定
3. SQL Editorで3章のSQLを一括実行
4. 各HTMLに `supabase-js`（CDN）を読み込み、`js/supabaseClient.js` にSUPABASE_URLとPublishable keyを設定
5. `login.html` / `mypage.html` を新規作成し、`index.html` ・ `player.html` にログイン状態表示とボタンを追加

---

## 7. 補足：Supabaseの権限まわりでハマったポイント

実装時に「ボタンの見た目は変わるのにSupabase側にデータが保存されない／マイページの一覧が空になる」という問題が発生した。原因は2つ。

1. **エラーを握りつぶしていた**：insert/delete の結果（`{ error }`）をチェックせず、常にボタンのUIだけ更新していたため、保存が失敗していても気づけなかった。→ 各ボタンの処理で `error` を必ずチェックし、失敗時はアラートを出すように修正。
2. **RLSポリシーはあるがGRANTがなかった**：`create policy` を実行しても、テーブルへの基本的なアクセス権限（GRANT）を `authenticated` ロールに与えていないと `permission denied for table ...` になる。RLSは「権限があるロールをさらに行単位で絞る」仕組みであり、GRANTの代わりにはならない。→ `grant select, insert, update, delete on ... to authenticated;` を追加。あわせて `NOTIFY pgrst, 'reload schema';` でPostgRESTのスキーマキャッシュを更新すると確実。

以降のテーブル追加（8章のマイセトリなど）では、最初からテーブル作成・RLS・GRANT・NOTIFYを1つのSQLブロックにまとめて実行する。

---

## 8. 追加機能：マイセトリ（自分だけのセットリスト）

名前をつけて複数作成でき、全ライブの全曲から自由に選んで並べ、その場で再生もできる。

### 8-1. テーブル設計

`custom_setlists`（セトリ本体）

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid, PK | |
| user_id | uuid, NOT NULL, references auth.users(id) | |
| name | text, NOT NULL | セトリの名前（例：「バラード集」） |
| created_at | timestamptz | |

`custom_setlist_items`（セトリに入っている曲）

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid, PK | |
| setlist_id | uuid, NOT NULL, references custom_setlists(id) | |
| user_id | uuid, NOT NULL, references auth.users(id) | RLSを単純にするため items 側にも冗長に持たせる |
| song_title | text, NOT NULL | 代表曲名（表記ゆれ統一後） |
| video_id | text, NOT NULL | 代表YouTube ID |
| position | integer, NOT NULL default 0 | 並び順 |
| created_at | timestamptz | |

曲のカタログ（全ライブ横断の曲名→代表YouTube ID）は、既存の表記ゆれ統一ロジック（`js/songUtils.js`）と同じ考え方で、`js/songCatalog.js` がその場で `data/*.json` 全件から動的に作る。曲ごとに一番よく使われているYouTube IDを代表として採用する。全ライブIDの一覧は `data/manifest.json` を参照する。

### 8-2. SQL（一括実行用）

```sql
create table public.custom_setlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.custom_setlist_items (
  id uuid primary key default gen_random_uuid(),
  setlist_id uuid not null references public.custom_setlists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  song_title text not null,
  video_id text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.custom_setlists enable row level security;
alter table public.custom_setlist_items enable row level security;

create policy "select own custom_setlists" on public.custom_setlists for select using (auth.uid() = user_id);
create policy "insert own custom_setlists" on public.custom_setlists for insert with check (auth.uid() = user_id);
create policy "update own custom_setlists" on public.custom_setlists for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own custom_setlists" on public.custom_setlists for delete using (auth.uid() = user_id);

create policy "select own custom_setlist_items" on public.custom_setlist_items for select using (auth.uid() = user_id);
create policy "insert own custom_setlist_items" on public.custom_setlist_items for insert with check (auth.uid() = user_id);
create policy "update own custom_setlist_items" on public.custom_setlist_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own custom_setlist_items" on public.custom_setlist_items for delete using (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.custom_setlists to authenticated;
grant select, insert, update, delete on public.custom_setlist_items to authenticated;

NOTIFY pgrst, 'reload schema';
```

### 8-3. 画面構成

- `mypage.html` に「🎵 マイセトリ」セクションを追加。セトリ一覧（名前・曲数・編集/削除/再生）、「＋新規作成」。
- 編集モード：曲名検索（`js/songCatalog.js` で作った全曲カタログを使用）→「追加」ボタンでitemsに追加。追加済みの曲は▲▼で並び替え、✕で削除。
- `myplayer.html`（新規）：`?setlist=<id>` でアクセスし、`custom_setlist_items` をposition順に取得して`player.html`と同じ要領でYouTube再生する。RLSにより本人以外は他人のセトリを再生できない。
