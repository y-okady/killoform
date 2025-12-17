# killoform

kintone アプリの設定情報を CLI で管理するツールです。

## インストール

### グローバルインストール（推奨）

```bash
npm install -g
```

これで、どのディレクトリからでも`killoform`コマンドが使用できます。

### 開発用（npm link）

開発中にローカルでリンクする場合：

```bash
npm link
```

これで、プロジェクトディレクトリから`killoform`コマンドが使用できます。

### ローカルインストール

プロジェクト内でのみ使用する場合：

```bash
npm install
npx killoform <コマンド>
```

## 環境変数

```
KINTONE_BASE_URL=https://<サブドメイン>.cybozu.com
```

## コマンド

### kintone アプリの設定を取得して反映する

```
$ killoform refresh <アプリID>
```

### kintone アプリの設定をコピーする

```
$ killoform copy <コピー元アプリID> <コピー先アプリID>
```

### kintone アプリの設定変更適用時の差分を確認する

```
$ killoform plan <アプリID>
```

### kintone アプリの設定情変更を適用する

```
$ killoform apply <アプリID>
```

## ディレクトリ構成

```
.
├── .env
├── apps
│   ├── <アプリID>
│   │   ├── .token // APIトークンの文字列のみが記載されたファイル
│   │   ├── form
│   │   │   ├── fields.json
│   │   │   └── layout.json
│   │   ├── plugin.json
│   │   ├── plugin
│   │   │   └── config.json (experimental)
│   │   ├── reports.json
│   │   └── views.json
└── package.json
```
