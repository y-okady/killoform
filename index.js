#!/usr/bin/env node

require('dotenv').config();
const { Command } = require('commander');
const { refreshCommand, planCommand, applyCommand, copyCommand } = require('./lib/commands');

const program = new Command();

program
  .name('killoform')
  .description('kintoneアプリの設定情報をCLIで管理するツール')
  .version('1.0.0');

program
  .command('refresh')
  .description('kintoneアプリの設定を取得して反映する')
  .argument('<appId>', 'アプリID')
  .action(async (appId) => {
    try {
      await refreshCommand(appId);
    } catch (error) {
      console.error('エラー:', error.message);
      process.exit(1);
    }
  });

program
  .command('plan')
  .description('kintoneアプリの設定変更適用時の差分を確認する')
  .argument('<appId>', 'アプリID')
  .action(async (appId) => {
    try {
      await planCommand(appId);
    } catch (error) {
      console.error('エラー:', error.message);
      process.exit(1);
    }
  });

program
  .command('apply')
  .description('kintoneアプリの設定変更を適用する')
  .argument('<appId>', 'アプリID')
  .action(async (appId) => {
    try {
      await applyCommand(appId);
    } catch (error) {
      console.error('エラー:', error.message);
      process.exit(1);
    }
  });

program
  .command('copy')
  .description('kintoneアプリの設定をコピーする')
  .argument('<sourceAppId>', 'コピー元アプリID')
  .argument('<targetAppId>', 'コピー先アプリID')
  .action(async (sourceAppId, targetAppId) => {
    try {
      await copyCommand(sourceAppId, targetAppId);
    } catch (error) {
      console.error('エラー:', error.message);
      process.exit(1);
    }
  });

program.parse();

