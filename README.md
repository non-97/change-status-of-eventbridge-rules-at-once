# Change status of EventBridge Rules at once

This is the State Machine that schedules the disabling and enabling of all EventBridge rules that match the name prefix.

## Usage

```bash
git change-status-of-eventbridge-rules-at-once

cd change-status-of-eventbridge-rules-at-once

npm install

npx cdk bootstrap

npx cdk deploy
```

## Directory

```bash
.
├── .gitignore
├── .npmignore
├── README.md
├── bin
│   └── change-status-of-eventbridge-rules-at-once.ts
├── cdk.json
├── jest.config.js
├── lib
│   └── change-status-of-eventbridge-rules-at-once-stack.ts
├── package-lock.json
├── package.json
├── test
│   └── change-status-of-eventbridge-rules-at-once.test.ts
└── tsconfig.json
```

## Detailed Description

- [[AWS Step Functions] 名前のプレフィックスが一致するEventBridgeルールを一定期間無効化もしくは有効化するステートマシンを作成してみた](https://dev.classmethod.jp/articles/change-status-of-eventbridge-rules-at-once/)
- [プレフィックスで一致したEventBridgeルールをまとめて無効化/有効化してみた](https://dev.classmethod.jp/articles/disable-or-enable-all-eventbridge-rules-that-match-by-name-prefix-at-once/)
