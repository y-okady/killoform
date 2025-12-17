killoform
==
kintoneアプリの設定情報をCLIで管理するツールです。

## 環境変数
```
KINTONE_BASE_URL=https://<サブドメイン>.cybozu.com
```

## コマンド
### kintoneアプリの設定を取得して反映する
```
$ killoform refresh <アプリID>
```

### kintoneアプリの設定変更適用時の差分を確認する
```
$ killoform plan <アプリID>
```

### kintoneアプリの設定情変更を適用する
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
│   │   └── plugin
│   │       └── config.json (experimental)
└── package.json
```
