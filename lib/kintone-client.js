const { KintoneRestAPIClient } = require("@kintone/rest-api-client");
const fs = require("fs").promises;
const path = require("path");

/**
 * kintone APIクライアントを作成
 */
function createClient(baseUrl, apiToken) {
  return new KintoneRestAPIClient({
    baseUrl: baseUrl,
    auth: {
      apiToken: apiToken,
    },
  });
}

/**
 * アプリのAPIトークンを読み込む
 */
async function loadApiToken(appId) {
  const { findAppDir } = require("./file-utils");
  const appDir = await findAppDir(appId);
  if (!appDir) {
    throw new Error(`アプリ ${appId} に対応するフォルダが見つかりません: apps/${appId} または apps/${appId}_*`);
  }
  const tokenPath = path.join(appDir, ".token");
  try {
    const token = await fs.readFile(tokenPath, "utf-8");
    return token.trim();
  } catch (error) {
    throw new Error(`APIトークンの読み込みに失敗しました: ${tokenPath}`);
  }
}

/**
 * アプリのフォーム情報を取得（動作テスト環境）
 */
async function getForm(appId, baseUrl, apiToken) {
  const client = createClient(baseUrl, apiToken);
  try {
    const result = await client.app.getFormFields({ app: appId, preview: true });
    return result.properties;
  } catch (error) {
    throw new Error(`フォーム情報の取得に失敗しました: ${error.message}`);
  }
}

/**
 * アプリのレイアウト情報を取得（動作テスト環境）
 */
async function getLayout(appId, baseUrl, apiToken) {
  const client = createClient(baseUrl, apiToken);
  try {
    const result = await client.app.getFormLayout({ app: appId, preview: true });
    return result.layout;
  } catch (error) {
    throw new Error(`レイアウト情報の取得に失敗しました: ${error.message}`);
  }
}

/**
 * アプリの一覧（views）情報を取得（動作テスト環境）
 */
async function getViews(appId, baseUrl, apiToken) {
  const client = createClient(baseUrl, apiToken);
  try {
    const result = await client.app.getViews({ app: appId, preview: true });
    return result.views;
  } catch (error) {
    throw new Error(`一覧情報の取得に失敗しました: ${error.message}`);
  }
}

/**
 * アプリのレポート（reports）情報を取得（動作テスト環境）
 */
async function getReports(appId, baseUrl, apiToken) {
  const client = createClient(baseUrl, apiToken);
  try {
    const result = await client.app.getReports({ app: appId, preview: true });
    return result.reports;
  } catch (error) {
    throw new Error(`レポート情報の取得に失敗しました: ${error.message}`);
  }
}

/**
 * アプリのプラグイン情報を取得（動作テスト環境）
 */
async function getPlugins(appId, baseUrl, apiToken) {
  const client = createClient(baseUrl, apiToken);
  try {
    const result = await client.app.getPlugins({ app: appId, preview: true });
    return result;
  } catch (error) {
    // プラグイン情報の取得は失敗しても続行可能
    console.warn(`プラグイン情報の取得に失敗しました: ${error.message}`);
    return null;
  }
}

/**
 * プラグインを追加
 */
async function addPlugins(appId, baseUrl, apiToken, pluginIds, revision) {
  const client = createClient(baseUrl, apiToken);
  try {
    const result = await client.app.addPlugins({
      app: appId,
      ids: pluginIds,
      revision: revision,
    });
    return result.revision;
  } catch (error) {
    throw new Error(`プラグインの追加に失敗しました: ${error.message}`);
  }
}

/**
 * プラグインの設定情報を取得（動作テスト環境）
 */
async function getPluginConfig(appId, pluginId, baseUrl, apiToken) {
  try {
    // URLパラメータをエンコード
    const params = new URLSearchParams({
      app: String(appId),
      id: pluginId,
    });
    const url = `${baseUrl}/k/v1/preview/app/plugin/config.json?${params.toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Cybozu-API-Token": apiToken,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `プラグイン設定の取得に失敗しました: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage += ` ${errorJson.message || errorText}`;
      } catch {
        errorMessage += ` ${errorText}`;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    throw new Error(`プラグイン設定の取得に失敗しました: ${error.message}`);
  }
}

/**
 * プラグインの設定情報を更新（動作テスト環境）
 */
async function updatePluginConfig(appId, pluginId, config, baseUrl, apiToken) {
  try {
    const url = `${baseUrl}/k/v1/preview/app/plugin/config.json`;
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "X-Cybozu-API-Token": apiToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        app: appId,
        id: pluginId,
        config: config,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`プラグイン設定の更新に失敗しました: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    throw new Error(`プラグイン設定の更新に失敗しました: ${error.message}`);
  }
}

/**
 * フィールドの差分を検出して適切なAPIを呼び出す
 */
async function applyFormFields(appId, baseUrl, apiToken, currentFields, localFields) {
  const client = createClient(baseUrl, apiToken);
  let revision = null;

  // フィールドコードのセットを作成
  const currentFieldCodes = new Set(Object.keys(currentFields || {}));
  const localFieldCodes = new Set(Object.keys(localFields || {}));

  // 追加されたフィールド（ローカルにのみ存在）
  const addedFields = {};
  for (const code of localFieldCodes) {
    if (!currentFieldCodes.has(code)) {
      addedFields[code] = localFields[code];
    }
  }

  // 削除されたフィールド（現在にのみ存在）
  const deletedFieldCodes = [];
  for (const code of currentFieldCodes) {
    if (!localFieldCodes.has(code)) {
      deletedFieldCodes.push(code);
    }
  }

  // 変更されたフィールド（両方に存在し、内容が異なる）
  const updatedFields = {};
  for (const code of localFieldCodes) {
    if (currentFieldCodes.has(code)) {
      const currentField = JSON.stringify(currentFields[code]);
      const localField = JSON.stringify(localFields[code]);
      if (currentField !== localField) {
        updatedFields[code] = localFields[code];
      }
    }
  }

  try {
    // 削除を先に実行（他のフィールドに依存している可能性があるため）
    if (deletedFieldCodes.length > 0) {
      console.log(`  削除: ${deletedFieldCodes.length}個のフィールド`);
      const result = await client.app.deleteFormFields({
        app: appId,
        fields: deletedFieldCodes,
      });
      revision = result.revision;
    }

    // 追加を実行
    if (Object.keys(addedFields).length > 0) {
      console.log(`  追加: ${Object.keys(addedFields).length}個のフィールド`);
      const result = await client.app.addFormFields({
        app: appId,
        properties: addedFields,
        revision: revision,
      });
      revision = result.revision;
    }

    // 更新を実行
    if (Object.keys(updatedFields).length > 0) {
      console.log(`  更新: ${Object.keys(updatedFields).length}個のフィールド`);
      const result = await client.app.updateFormFields({
        app: appId,
        properties: updatedFields,
        revision: revision,
      });
      revision = result.revision;
    }

    return revision;
  } catch (error) {
    throw new Error(`フォーム情報の適用に失敗しました: ${error.message}`);
  }
}

/**
 * フォーム情報を更新（後方互換性のため残す）
 */
async function updateForm(appId, baseUrl, apiToken, fields) {
  const client = createClient(baseUrl, apiToken);
  try {
    const result = await client.app.updateFormFields({ app: appId, properties: fields });
    return result.revision;
  } catch (error) {
    throw new Error(`フォーム情報の更新に失敗しました: ${error.message}`);
  }
}

/**
 * レイアウト情報を更新
 */
async function updateLayout(appId, baseUrl, apiToken, layout) {
  const client = createClient(baseUrl, apiToken);
  try {
    const result = await client.app.updateFormLayout({ app: appId, layout: layout });
    return result.revision;
  } catch (error) {
    throw new Error(`レイアウト情報の更新に失敗しました: ${error.message}`);
  }
}

/**
 * 一覧（views）情報を更新
 */
async function updateViews(appId, baseUrl, apiToken, views, revision) {
  const client = createClient(baseUrl, apiToken);
  try {
    const result = await client.app.updateViews({
      app: appId,
      views: views,
      revision: revision,
    });
    return result.revision;
  } catch (error) {
    throw new Error(`一覧情報の更新に失敗しました: ${error.message}`);
  }
}

/**
 * レポート（reports）情報を更新
 */
async function updateReports(appId, baseUrl, apiToken, reports, revision) {
  const client = createClient(baseUrl, apiToken);
  try {
    const result = await client.app.updateReports({
      app: appId,
      reports: reports,
      revision: revision,
    });
    return result.revision;
  } catch (error) {
    throw new Error(`レポート情報の更新に失敗しました: ${error.message}`);
  }
}

/**
 * アプリの設定を運用環境へ反映する
 */
async function deployAppSettings(appId, baseUrl, apiToken, revision) {
  const client = createClient(baseUrl, apiToken);
  try {
    await client.app.deployApp({
      apps: [
        {
          app: appId,
          revision: revision,
        },
      ],
      revert: false,
    });
  } catch (error) {
    throw new Error(`運用環境への反映に失敗しました: ${error.message}`);
  }
}

module.exports = {
  loadApiToken,
  getForm,
  getLayout,
  getViews,
  getReports,
  getPlugins,
  addPlugins,
  getPluginConfig,
  updatePluginConfig,
  applyFormFields,
  updateForm,
  updateLayout,
  updateViews,
  updateReports,
  deployAppSettings,
};
