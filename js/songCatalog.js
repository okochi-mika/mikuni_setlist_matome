// 全ライブを横断した「曲名カタログ」を作る（マイセトリの曲選択用）。
// data/manifest.json に載っている全ライブのJSONを読み込み、
// 曲名（表記ゆれ統一後）ごとに、一番よく使われている代表表記とYouTube動画IDをまとめる。
// normalizeTitle / dedupeKey は js/songUtils.js で定義。

function buildSongCatalog() {
    return fetch('data/manifest.json', { cache: 'no-store' })
        .then(res => (res.ok ? res.json() : []))
        .catch(() => [])
        .then(ids => Promise.all(ids.map(id =>
            fetch(`data/${id}.json`, { cache: 'no-store' })
                .then(res => (res.ok ? res.json() : null))
                .catch(() => null)
        )))
        .then(dataList => {
            const variantCounts = new Map();   // key -> Map(表記 -> 出現回数)
            const videoIdCounts = new Map();   // key -> Map(videoId -> 出現回数)

            dataList.forEach(data => {
                if (!data || !Array.isArray(data.tracks)) return;
                data.tracks.forEach(track => {
                    const name = normalizeTitle(track.title || '');
                    if (!name) return;
                    const key = dedupeKey(name);

                    if (!variantCounts.has(key)) variantCounts.set(key, new Map());
                    const vc = variantCounts.get(key);
                    vc.set(name, (vc.get(name) || 0) + 1);

                    if (track.id) {
                        if (!videoIdCounts.has(key)) videoIdCounts.set(key, new Map());
                        const idc = videoIdCounts.get(key);
                        idc.set(track.id, (idc.get(track.id) || 0) + 1);
                    }
                });
            });

            const catalog = [];
            variantCounts.forEach((variants, key) => {
                let bestLabel = null;
                let bestCount = -1;
                variants.forEach((count, label) => {
                    if (count > bestCount || (count === bestCount && bestLabel !== null && label.localeCompare(bestLabel, 'ja') < 0)) {
                        bestCount = count;
                        bestLabel = label;
                    }
                });

                let bestVideoId = null;
                let bestVideoCount = -1;
                const idc = videoIdCounts.get(key);
                if (idc) {
                    idc.forEach((count, videoId) => {
                        if (count > bestVideoCount) {
                            bestVideoCount = count;
                            bestVideoId = videoId;
                        }
                    });
                }

                if (bestLabel && bestVideoId) {
                    catalog.push({ title: bestLabel, videoId: bestVideoId });
                }
            });

            catalog.sort((a, b) => a.title.localeCompare(b.title, 'ja'));
            return catalog;
        });
}
