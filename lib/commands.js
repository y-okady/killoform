const path = require("path");
const readline = require("readline");
const chalk = require("chalk");
const { createTwoFilesPatch } = require("diff");
const {
  loadApiToken,
  getForm,
  getLayout,
  getViews,
  getReports,
  getAppActions,
  getPlugins,
  addPlugins,
  getPluginConfig,
  updatePluginConfig,
  applyFormFields,
  updateForm,
  updateLayout,
  updateViews,
  updateReports,
  updateAppActions,
  deployAppSettings,
} = require("./kintone-client");
const {
  ensureDirectory,
  readJsonFile,
  writeJsonFile,
  findAppDir,
  getAppDir,
  getFormDir,
  getPluginDir,
} = require("./file-utils");

/**
 * 環境変数からベースURLを取得
 */
function getBaseUrl() {
  const baseUrl = process.env.KINTONE_BASE_URL;
  if (!baseUrl) {
    throw new Error("環境変数 KINTONE_BASE_URL が設定されていません");
  }
  return baseUrl;
}

/**
 * refreshコマンド: kintoneアプリの設定を取得して反映する
 */
async function refreshCommand(appId) {
  console.log(`アプリ ${appId} の設定を取得しています...`);

  const baseUrl = getBaseUrl();
  const apiToken = await loadApiToken(appId);

  // フォーム情報を取得
  console.log("フォーム情報を取得中...");
  const fields = await getForm(appId, baseUrl, apiToken);

  // レイアウト情報を取得
  console.log("レイアウト情報を取得中...");
  const layout = await getLayout(appId, baseUrl, apiToken);

  // 一覧情報を取得
  console.log("一覧情報を取得中...");
  const views = await getViews(appId, baseUrl, apiToken);

  // レポート情報を取得
  console.log("レポート情報を取得中...");
  const reports = await getReports(appId, baseUrl, apiToken);

  // アプリアクション設定を取得
  console.log("アプリアクション設定を取得中...");
  const actions = await getAppActions(appId, baseUrl, apiToken);

  // プラグイン情報を取得
  console.log("プラグイン情報を取得中...");
  const plugins = await getPlugins(appId, baseUrl, apiToken);

  // ディレクトリを作成
  const formDir = await getFormDir(appId);
  await ensureDirectory(formDir);

  // ファイルに保存
  console.log("設定を保存中...");
  await writeJsonFile(path.join(formDir, "fields.json"), fields);
  await writeJsonFile(path.join(formDir, "layout.json"), layout);

  const appDir = await getAppDir(appId);
  await writeJsonFile(path.join(appDir, "views.json"), views);
  await writeJsonFile(path.join(appDir, "reports.json"), reports);
  await writeJsonFile(path.join(appDir, "actions.json"), actions);

  if (plugins) {
    // revisionを除外して保存
    const pluginsWithoutRevision = {
      plugins: plugins.plugins || [],
    };
    await writeJsonFile(path.join(appDir, "plugin.json"), pluginsWithoutRevision);

    // プラグインの設定情報を取得
    if (plugins.plugins && plugins.plugins.length > 0) {
      console.log("プラグイン設定情報を取得中...");
      const pluginConfigs = {};
      for (const plugin of plugins.plugins) {
        if (plugin.enabled) {
          try {
            const config = await getPluginConfig(appId, plugin.id, baseUrl, apiToken);
            pluginConfigs[plugin.id] = config;
          } catch (error) {
            console.warn(`  プラグイン ${plugin.name} (${plugin.id}) の設定取得に失敗: ${error.message}`);
          }
        }
      }

      if (Object.keys(pluginConfigs).length > 0) {
        const pluginDir = await getPluginDir(appId);
        await ensureDirectory(pluginDir);
        await writeJsonFile(path.join(pluginDir, "config.json"), pluginConfigs);
      }
    }
  }

  console.log("✓ 設定の取得が完了しました");
}

/**
 * オブジェクトからrevisionとidフィールドを再帰的に削除
 */
function removeRevisionAndId(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(removeRevisionAndId);
  }
  if (typeof obj === "object") {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key !== "revision" && key !== "id") {
        result[key] = removeRevisionAndId(value);
      }
    }
    return result;
  }
  return obj;
}

/**
 * git diff形式で差分を表示
 */
function printDiff(oldContent, newContent, filePath) {
  // revisionとidを除外して比較
  const oldWithoutRevision = removeRevisionAndId(oldContent);
  const newWithoutRevision = removeRevisionAndId(newContent);
  const oldText = JSON.stringify(oldWithoutRevision, null, 2);
  const newText = JSON.stringify(newWithoutRevision, null, 2);

  if (oldText === newText) {
    return false;
  }

  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  // createTwoFilesPatchを使用してgit diff形式のパッチを生成
  const patch = createTwoFilesPatch(`a/${filePath}`, `b/${filePath}`, oldText, newText, "変更前", "変更後", {
    context: 3,
  });

  // パッチのヘッダー部分（Index: など）を除いて、diff部分のみを表示し、色付け
  const lines = patch.split("\n");
  let inDiff = false;
  let output = [];

  for (const line of lines) {
    if (line.startsWith("diff --git")) {
      inDiff = true;
      output.push(chalk.gray(line));
    } else if (line.startsWith("---")) {
      inDiff = true;
      output.push(chalk.red(line));
    } else if (line.startsWith("+++")) {
      inDiff = true;
      output.push(chalk.green(line));
    } else if (line.startsWith("@@")) {
      inDiff = true;
      output.push(chalk.cyan(line));
    } else if (inDiff && line.startsWith("-")) {
      output.push(chalk.red(line));
    } else if (inDiff && line.startsWith("+")) {
      output.push(chalk.green(line));
    } else if (inDiff && (line.startsWith(" ") || line === "")) {
      output.push(line);
    }
  }

  if (output.length > 0) {
    console.log("\n" + output.join("\n"));
    return true;
  }

  return false;
}

/**
 * planコマンド: 設定変更適用時の差分を確認する
 */
async function planCommand(appId) {
  console.log(`アプリ ${appId} の設定変更差分を確認しています...`);

  const baseUrl = getBaseUrl();
  const apiToken = await loadApiToken(appId);

  // 現在の設定を取得
  console.log("現在の設定を取得中...");
  const currentFields = await getForm(appId, baseUrl, apiToken);
  const currentLayout = await getLayout(appId, baseUrl, apiToken);
  const currentViews = await getViews(appId, baseUrl, apiToken);
  const currentReports = await getReports(appId, baseUrl, apiToken);
  const currentActions = await getAppActions(appId, baseUrl, apiToken);

  // プラグイン情報と設定を取得
  const plugins = await getPlugins(appId, baseUrl, apiToken);
  const currentPluginConfigs = {};
  if (plugins && plugins.plugins) {
    for (const plugin of plugins.plugins) {
      if (plugin.enabled) {
        try {
          const config = await getPluginConfig(appId, plugin.id, baseUrl, apiToken);
          currentPluginConfigs[plugin.id] = config;
        } catch (error) {
          // プラグイン設定の取得に失敗しても続行
          console.warn(`  プラグイン ${plugin.name} (${plugin.id}) の設定取得に失敗: ${error.message}`);
        }
      }
    }
  }

  // ローカルの設定を読み込み
  const formDir = await getFormDir(appId);
  const appDir = await getAppDir(appId);
  const pluginDir = await getPluginDir(appId);
  const localFields = await readJsonFile(path.join(formDir, "fields.json"));
  const localLayout = await readJsonFile(path.join(formDir, "layout.json"));
  const localViews = await readJsonFile(path.join(appDir, "views.json"));
  const localReports = await readJsonFile(path.join(appDir, "reports.json"));
  const localActions = await readJsonFile(path.join(appDir, "actions.json"));
  const localPlugins = await readJsonFile(path.join(appDir, "plugin.json"));
  const localPluginConfigs = await readJsonFile(path.join(pluginDir, "config.json"));

  if (
    !localFields &&
    !localLayout &&
    !localViews &&
    !localReports &&
    !localActions &&
    !localPlugins &&
    !localPluginConfigs
  ) {
    console.log("ローカルの設定ファイルが見つかりません。先に refresh コマンドを実行してください。");
    return;
  }

  // 実際のディレクトリ名を取得（apps/からの相対パス）
  const appsDir = path.join(process.cwd(), "apps");
  const relativeAppDir = path.relative(appsDir, appDir);
  const relativeFormDir = path.relative(appsDir, formDir);
  const relativePluginDir = path.relative(appsDir, pluginDir);

  let hasAnyChanges = false;

  // フォームフィールドの差分
  if (localFields) {
    const filePath = path.join(relativeFormDir, "fields.json").replace(/\\/g, "/");
    const hasChanges = printDiff(currentFields, localFields, filePath);
    if (!hasChanges) {
      console.log(`\n${filePath}: 変更なし`);
    } else {
      hasAnyChanges = true;
    }
  } else {
    console.log("\nローカルのフィールド設定が見つかりません");
  }

  // レイアウトの差分
  if (localLayout) {
    const filePath = path.join(relativeFormDir, "layout.json").replace(/\\/g, "/");
    const hasChanges = printDiff(currentLayout, localLayout, filePath);
    if (!hasChanges) {
      console.log(`\n${filePath}: 変更なし`);
    } else {
      hasAnyChanges = true;
    }
  } else {
    console.log("\nローカルのレイアウト設定が見つかりません");
  }

  // 一覧の差分
  if (localViews) {
    const filePath = path.join(relativeAppDir, "views.json").replace(/\\/g, "/");
    const hasChanges = printDiff(currentViews, localViews, filePath);
    if (!hasChanges) {
      console.log(`\n${filePath}: 変更なし`);
    } else {
      hasAnyChanges = true;
    }
  } else {
    console.log("\nローカルの一覧設定が見つかりません");
  }

  // レポートの差分
  if (localReports) {
    const filePath = path.join(relativeAppDir, "reports.json").replace(/\\/g, "/");
    const hasChanges = printDiff(currentReports, localReports, filePath);
    if (!hasChanges) {
      console.log(`\n${filePath}: 変更なし`);
    } else {
      hasAnyChanges = true;
    }
  } else {
    console.log("\nローカルのレポート設定が見つかりません");
  }

  // アプリアクション設定の差分
  if (localActions) {
    const filePath = path.join(relativeAppDir, "actions.json").replace(/\\/g, "/");
    const hasChanges = printDiff(currentActions, localActions, filePath);
    if (!hasChanges) {
      console.log(`\n${filePath}: 変更なし`);
    } else {
      hasAnyChanges = true;
    }
  } else {
    console.log("\nローカルのアプリアクション設定が見つかりません");
  }

  // プラグイン情報の差分
  if (localPlugins) {
    const filePath = path.join(relativeAppDir, "plugin.json").replace(/\\/g, "/");
    const hasChanges = printDiff(plugins, localPlugins, filePath);
    if (!hasChanges) {
      console.log(`\n${filePath}: 変更なし`);
    } else {
      hasAnyChanges = true;
    }
  } else {
    console.log("\nローカルのプラグイン情報が見つかりません");
  }

  // プラグイン設定の差分
  if (localPluginConfigs) {
    const filePath = path.join(relativePluginDir, "config.json").replace(/\\/g, "/");
    const hasChanges = printDiff(currentPluginConfigs, localPluginConfigs, filePath);
    if (!hasChanges) {
      console.log(`\n${filePath}: 変更なし`);
    } else {
      hasAnyChanges = true;
    }
  } else {
    console.log("\nローカルのプラグイン設定が見つかりません");
  }

  if (
    !hasAnyChanges &&
    localFields &&
    localLayout &&
    localViews &&
    localReports &&
    localPlugins &&
    localPluginConfigs
  ) {
    console.log("\nすべての設定に変更はありません。");
  }
}

/**
 * ユーザーに確認を求める
 */
function askConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === "y" || normalized === "yes" || normalized === "はい");
    });
  });
}

/**
 * applyコマンド: 設定変更を適用する
 */
async function applyCommand(appId) {
  console.log(`アプリ ${appId} の設定変更差分を確認しています...`);

  const baseUrl = getBaseUrl();
  const apiToken = await loadApiToken(appId);

  // 現在の設定を取得
  console.log("現在の設定を取得中...");
  const currentFields = await getForm(appId, baseUrl, apiToken);
  const currentLayout = await getLayout(appId, baseUrl, apiToken);
  const currentViews = await getViews(appId, baseUrl, apiToken);
  const currentReports = await getReports(appId, baseUrl, apiToken);
  const currentActions = await getAppActions(appId, baseUrl, apiToken);

  // プラグイン情報と設定を取得
  const plugins = await getPlugins(appId, baseUrl, apiToken);
  const currentPluginConfigs = {};
  if (plugins && plugins.plugins) {
    for (const plugin of plugins.plugins) {
      if (plugin.enabled) {
        try {
          const config = await getPluginConfig(appId, plugin.id, baseUrl, apiToken);
          currentPluginConfigs[plugin.id] = config;
        } catch (error) {
          // プラグイン設定の取得に失敗しても続行
          console.warn(`  プラグイン ${plugin.name} (${plugin.id}) の設定取得に失敗: ${error.message}`);
        }
      }
    }
  }

  // ローカルの設定を読み込み
  const formDir = await getFormDir(appId);
  const appDir = await getAppDir(appId);
  const pluginDir = await getPluginDir(appId);
  const localFields = await readJsonFile(path.join(formDir, "fields.json"));
  const localLayout = await readJsonFile(path.join(formDir, "layout.json"));
  const localViews = await readJsonFile(path.join(appDir, "views.json"));
  const localReports = await readJsonFile(path.join(appDir, "reports.json"));
  const localActions = await readJsonFile(path.join(appDir, "actions.json"));
  const localPlugins = await readJsonFile(path.join(appDir, "plugin.json"));
  const localPluginConfigs = await readJsonFile(path.join(pluginDir, "config.json"));

  if (
    !localFields &&
    !localLayout &&
    !localViews &&
    !localReports &&
    !localActions &&
    !localPlugins &&
    !localPluginConfigs
  ) {
    throw new Error("ローカルの設定ファイルが見つかりません。先に refresh コマンドを実行してください。");
  }

  // 実際のディレクトリ名を取得（apps/からの相対パス）
  const appsDir = path.join(process.cwd(), "apps");
  const relativeAppDir = path.relative(appsDir, appDir);
  const relativeFormDir = path.relative(appsDir, formDir);
  const relativePluginDir = path.relative(appsDir, pluginDir);

  // 差分を表示
  let hasAnyChanges = false;

  // フォームフィールドの差分
  if (localFields) {
    const filePath = path.join(relativeFormDir, "fields.json").replace(/\\/g, "/");
    const hasChanges = printDiff(currentFields, localFields, filePath);
    if (hasChanges) {
      hasAnyChanges = true;
    }
  }

  // レイアウトの差分
  if (localLayout) {
    const filePath = path.join(relativeFormDir, "layout.json").replace(/\\/g, "/");
    const hasChanges = printDiff(currentLayout, localLayout, filePath);
    if (hasChanges) {
      hasAnyChanges = true;
    }
  }

  // 一覧の差分
  if (localViews) {
    const filePath = path.join(relativeAppDir, "views.json").replace(/\\/g, "/");
    const hasChanges = printDiff(currentViews, localViews, filePath);
    if (hasChanges) {
      hasAnyChanges = true;
    }
  }

  // レポートの差分
  if (localReports) {
    const filePath = path.join(relativeAppDir, "reports.json").replace(/\\/g, "/");
    const hasChanges = printDiff(currentReports, localReports, filePath);
    if (hasChanges) {
      hasAnyChanges = true;
    }
  }

  // アプリアクション設定の差分
  if (localActions) {
    const filePath = path.join(relativeAppDir, "actions.json").replace(/\\/g, "/");
    const hasChanges = printDiff(currentActions, localActions, filePath);
    if (hasChanges) {
      hasAnyChanges = true;
    }
  }

  // プラグイン情報の差分
  if (localPlugins) {
    const filePath = path.join(relativeAppDir, "plugin.json").replace(/\\/g, "/");
    const hasChanges = printDiff(plugins, localPlugins, filePath);
    if (hasChanges) {
      hasAnyChanges = true;
    }
  }

  // プラグイン設定の差分
  if (localPluginConfigs) {
    const filePath = path.join(relativePluginDir, "config.json").replace(/\\/g, "/");
    const hasChanges = printDiff(currentPluginConfigs, localPluginConfigs, filePath);
    if (hasChanges) {
      hasAnyChanges = true;
    }
  }

  // 差分がなければ終了
  if (!hasAnyChanges) {
    console.log("\nすべての設定に変更はありません。");
    return;
  }

  // 設定を適用するか確認
  const shouldApply = await askConfirmation(chalk.yellow("\n設定を適用しますか？ (y/N): "));

  if (!shouldApply) {
    console.log("設定の適用をキャンセルしました。");
    return;
  }

  // 設定を適用
  console.log("\n設定を適用しています...");

  let revision = null;

  if (localFields) {
    console.log("フォームフィールドを適用中...");
    revision = await applyFormFields(appId, baseUrl, apiToken, currentFields, localFields);
  }

  if (localLayout) {
    console.log("レイアウトを更新中...");
    revision = await updateLayout(appId, baseUrl, apiToken, localLayout);
  }

  if (localViews) {
    console.log("一覧を更新中...");
    revision = await updateViews(appId, baseUrl, apiToken, localViews, revision);
  }

  if (localReports) {
    console.log("レポートを更新中...");
    revision = await updateReports(appId, baseUrl, apiToken, localReports, revision);
  }

  if (localActions) {
    console.log("アプリアクション設定を更新中...");
    revision = await updateAppActions(appId, baseUrl, apiToken, localActions, revision);
  }

  // プラグイン情報を適用
  if (localPlugins && plugins) {
    const currentPluginIds = new Set((plugins.plugins || []).map((p) => p.id));
    const localPluginIds = new Set((localPlugins.plugins || []).map((p) => p.id));

    // 追加するプラグイン（ローカルにのみ存在）
    const pluginsToAdd = [];
    for (const plugin of localPlugins.plugins || []) {
      if (!currentPluginIds.has(plugin.id)) {
        pluginsToAdd.push(plugin.id);
      }
    }

    if (pluginsToAdd.length > 0) {
      console.log(`プラグインを追加中... (${pluginsToAdd.length}個)`);
      revision = await addPlugins(appId, baseUrl, apiToken, pluginsToAdd, revision);
    }

    // 注意: プラグインの削除や無効化は別のAPIが必要なため、現時点では追加のみ対応
    const pluginsToRemove = [];
    for (const plugin of plugins.plugins || []) {
      if (!localPluginIds.has(plugin.id)) {
        pluginsToRemove.push(plugin.id);
      }
    }
    if (pluginsToRemove.length > 0) {
      console.warn(
        `  注意: ${pluginsToRemove.length}個のプラグインが削除対象ですが、プラグインの削除は手動で行ってください`
      );
    }
  }

  // プラグイン設定を更新
  if (localPluginConfigs) {
    console.log("プラグイン設定を更新中...");
    for (const [pluginId, pluginConfig] of Object.entries(localPluginConfigs)) {
      if (pluginConfig && pluginConfig.config) {
        try {
          const result = await updatePluginConfig(appId, pluginId, pluginConfig.config, baseUrl, apiToken);
          if (result && result.revision) {
            revision = result.revision;
          }
          console.log(`  プラグイン ${pluginId} の設定を更新しました`);
        } catch (error) {
          console.warn(`  プラグイン ${pluginId} の設定更新に失敗: ${error.message}`);
        }
      }
    }
  }

  console.log("✓ 設定の適用が完了しました");

  // 設定適用後に最新の状態を取得してローカルファイルを更新
  console.log("\n最新の設定を取得して更新しています...");
  await refreshCommand(appId);

  // 運用環境への反映を確認
  const shouldDeploy = await askConfirmation(chalk.yellow("\n運用環境に反映しますか？ (y/N): "));

  if (shouldDeploy) {
    console.log("運用環境への反映を実行します...");

    // 最新のrevisionを取得
    const { KintoneRestAPIClient } = require("@kintone/rest-api-client");
    const kintoneClient = new KintoneRestAPIClient({
      baseUrl: baseUrl,
      auth: {
        apiToken: apiToken,
      },
    });
    const formResult = await kintoneClient.app.getFormFields({ app: appId, preview: true });
    const latestRevision = formResult.revision;

    console.log(`アプリ ${appId} (revision: ${latestRevision}) を運用環境に反映中...`);
    await deployAppSettings(appId, baseUrl, apiToken, latestRevision);
    console.log("✓ 運用環境への反映が完了しました");
  } else {
    console.log("運用環境への反映をスキップしました");
  }
}

/**
 * copyコマンド: アプリの設定をコピーする
 */
async function copyCommand(sourceAppId, targetAppId) {
  const fs = require("fs").promises;
  const path = require("path");

  console.log(`アプリ ${sourceAppId} の設定を ${targetAppId} にコピーしています...`);

  // コピー元とコピー先のディレクトリを取得
  const sourceDir = await findAppDir(sourceAppId);
  if (!sourceDir) {
    throw new Error(`コピー元のアプリ ${sourceAppId} のディレクトリが見つかりません`);
  }

  // コピー先のディレクトリを取得（既存のフォルダがあればそれを使用、なければ<appId>を作成）
  const targetDir = await getAppDir(targetAppId);

  // コピー元のディレクトリが存在するか確認
  try {
    await fs.access(sourceDir);
  } catch (error) {
    throw new Error(`コピー元のディレクトリにアクセスできません: ${sourceDir}`);
  }

  // コピー先のディレクトリを作成
  await ensureDirectory(targetDir);

  // ディレクトリを再帰的にコピーする関数
  async function copyDirectory(src, dest) {
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      // .tokenファイルはスキップ
      if (entry.name === ".token") {
        console.log(`  ${entry.name} をスキップしました`);
        continue;
      }

      if (entry.isDirectory()) {
        await ensureDirectory(destPath);
        await copyDirectory(srcPath, destPath);
      } else {
        console.log(`  ${entry.name} をコピー中...`);
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  await copyDirectory(sourceDir, targetDir);

  console.log(`✓ アプリ ${sourceAppId} の設定を ${targetAppId} にコピーしました`);
}

module.exports = {
  refreshCommand,
  planCommand,
  applyCommand,
  copyCommand,
};
