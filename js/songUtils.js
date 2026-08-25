// 曲名の正規化ユーティリティ（index.html の検索機能、player.html / mypage.html の
// お気に入り機能で同じ曲を同じキーとして扱うための共通ロジック）

// 「1. 曲名」→「曲名」のように先頭のトラック番号を除去
function normalizeTitle(title) {
    return (title || '').replace(/^\s*\d+[\.\)、]\s*/, '').trim();
}

// 表記ゆれ（全角/半角チルダ、大文字小文字、空白）を無視した比較用キー
function dedupeKey(title) {
    return (title || '')
        .replace(/[~〜～]/g, '~')   // 半角チルダ / 波ダッシュ / 全角チルダ を統一
        .replace(/\s+/g, '')        // 半角・全角スペースを除去
        .toLowerCase();
}
