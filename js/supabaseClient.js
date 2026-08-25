// Supabase接続設定
// このファイルは各HTMLから <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
// の後に読み込むこと。window.sb にクライアントを生やす。
//
// 注意：ここに書く key は "publishable key"（旧: anon key）。
// RLS（Row Level Security）で保護されている前提で、公開しても問題ない設計のキー。
// 絶対に secret key / service_role key はここに書かないこと。

(function () {
    const SUPABASE_URL = 'https://sgzrqbeocgpdifkzspgf.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Jw59PjHwYZZ8g_6ugw9PoA_hPuNk2v4';

    if (typeof window.supabase === 'undefined') {
        console.error('supabase-js が読み込まれていません。<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> を先に読み込んでください。');
        return;
    }

    window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
})();
