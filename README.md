# 旅の予習ポータル

旅行前に旅行vlogやブログで予習する人向けに、国ごとに良質な動画とブログへのリンクをまとめる静的サイトです。

- TOPの世界地図でエリアを選び、国・地域を選ぶと国のページが別タブで開きます。
- 掲載するのは、外務省「海外安全ホームページ」で主な観光地が危険レベル0の国・地域だけです。感染症危険情報が出ている国は載せません。

## しくみ

| ファイル | 役割 |
|---|---|
| `data/countries.json` | 掲載する国・地域の一覧と基本情報。**国を増やすときはここに1件足すだけ** |
| `data/regions.json` | 地図のエリア（アジア、ヨーロッパなど）と拡大範囲 |
| `data/safety.json` | 危険情報の判定結果（自動で更新） |
| `data/overrides.json` | 自動判定を人が上書きするとき用 |
| `data/videos/<国ID>.json` | 動画の候補（自動で更新）。`status` と `summary` は手で編集できる |
| `data/blogs/<国ID>.json` | ブログ・記事のリンク（手で追加。`title` を空にするとページのタイトルを自動で使う） |
| `data/links.json` | リンクの確認結果（自動で更新。2回続けて開けないリンクは非表示） |
| `scripts/check-links.mjs` | ブログ・記事のリンクを確認し、タイトルとリンク切れを記録 |
| `data/config.json` | サイト名、動画の選び方の条件 |
| `scripts/check-safety.mjs` | 外務省のページを読み、各国の掲載可否を判定 |
| `scripts/collect-videos.mjs` | YouTube Data API で動画の候補を集めて点数を付ける |
| `scripts/build.mjs` | `dist/` にサイトを生成 |
| `.github/workflows/weekly-update.yml` | 毎週月曜に上の3つを実行して公開 |

## 国を追加する

1. `data/countries.json` に1件追加します。`map.isoNumeric` は ISO 3166-1 の3桁の国番号、小さな島などは `map.marker` に `[経度, 緯度]` を入れます。
2. 外務省の危険情報が出ている国は、`safety.mofaCode` に外務省の国別ページの番号を入れます（`https://www.anzen.mofa.go.jp/info/pcinfectionspothazardinfo_007.html` なら `007`）。`safety.touristAreas` には主な観光地の名前を入れます。
3. コミットすると自動で公開されます。動画は次の週次実行で集まります（すぐ集めたいときは Actions から手動実行）。

## 危険情報の自動反映

毎週、`check-safety.mjs` が次のルールで判定します。

- 危険情報一覧に載っていない国 → 掲載する
- 載っている国 → 国別ページの危険情報に「全土」「上記以外の地域」などがある、または `touristAreas` の観光地名が含まれていれば **自動で非公開**。それ以外は一部地域だけと判断して掲載を続ける
- 感染症危険情報が出ている → **自動で非公開**
- 一覧ページを読み取れないときは何も変えずに失敗し、GitHub から通知が届く

判定が変わると Issue が作られます。自動判定が誤りのときは `data/overrides.json` に次のように書くと上書きできます（`hash` は `safety.json` の値。危険情報が再び変わると上書きは無効になります）。

```json
{ "thailand": { "status": "ok", "hash": "0123abcd...", "note": "バンコクは背景説明に出てくるだけ" } }
```

## 動画の選び方

`config.json` の条件（再生数1万回以上、5〜40分、3年以内、日本語タイトル）に合う動画に、再生数・いいね率・新しさで点数を付けます。

- `mode: "auto"` … 点数の高い順に自動で表示（初期設定）。最初は `initial` 本（8本）、「もっと見る」を押すたびに `step` 本ずつ、最大 `max` 本（24本）まで
- `mode: "manual"` … `status: "approved"` にした動画だけを表示
- どちらのモードでも、`status: "blocked"` にした動画は表示しません。`summary` に書いた概要がカードに表示されます

## 権利面のルール

- 動画はリンクと YouTube 公式の埋め込みだけ。サムネイルは YouTube API が返す画像を、その動画へのリンクとしてだけ表示します
- 動画の概要やブログの紹介文は自分の言葉で書き、説明文や本文はコピーしない
- 安全情報は出典を明記して要約し、外務省のページへリンクする
- 地図データは [world-atlas](https://github.com/topojson/world-atlas)（Natural Earth、パブリックドメイン）

## はじめての設定

1. このリポジトリの Settings → Pages で Source を「GitHub Actions」にする
2. Google Cloud で YouTube Data API v3 を有効にして APIキーを作り、Settings → Secrets and variables → Actions に `YOUTUBE_API_KEY` として登録する
3. 動画の概要文を自動で作る場合は、Google AI Studio で Gemini の APIキーを作り、`GEMINI_API_KEY` として同じ場所に登録する
4. Actions の weekly-update を手動実行する（概要文だけ作り直すときは summarize を実行）

## 手元で確認する

```sh
npm ci
node scripts/build.mjs --demo   # 動画が無い国にサンプルを表示
npx serve dist                  # http://localhost:3000
```
