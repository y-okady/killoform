const fs = require('fs').promises;
const path = require('path');

/**
 * ディレクトリが存在しない場合は作成
 */
async function ensureDirectory(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    throw new Error(`ディレクトリの作成に失敗しました: ${dirPath}`);
  }
}

/**
 * JSONファイルを読み込む
 */
async function readJsonFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw new Error(`JSONファイルの読み込みに失敗しました: ${filePath}: ${error.message}`);
  }
}

/**
 * JSONファイルを書き込む
 */
async function writeJsonFile(filePath, data) {
  try {
    await ensureDirectory(path.dirname(filePath));
    await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  } catch (error) {
    throw new Error(`JSONファイルの書き込みに失敗しました: ${filePath}: ${error.message}`);
  }
}

/**
 * アプリIDに対応するフォルダを検索（<アプリID>または<アプリID>_<任意の文字列>）
 */
async function findAppDir(appId) {
  const appsDir = path.join(process.cwd(), 'apps');
  try {
    const entries = await fs.readdir(appsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirName = entry.name;
        // <appId>または<appId>_*の形式に一致するかチェック
        if (dirName === appId || dirName.startsWith(`${appId}_`)) {
          return path.join(appsDir, dirName);
        }
      }
    }
  } catch (error) {
    // appsディレクトリが存在しない場合はnullを返す
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
  return null;
}

/**
 * アプリのディレクトリパスを取得（既存のフォルダがあればそれを使用、なければ<appId>を作成）
 */
async function getAppDir(appId) {
  const existingDir = await findAppDir(appId);
  if (existingDir) {
    return existingDir;
  }
  // 既存のフォルダがない場合は<appId>フォルダを使用
  return path.join(process.cwd(), 'apps', appId);
}

/**
 * フォームのディレクトリパスを取得
 */
async function getFormDir(appId) {
  const appDir = await getAppDir(appId);
  return path.join(appDir, 'form');
}

/**
 * プラグインのディレクトリパスを取得
 */
async function getPluginDir(appId) {
  const appDir = await getAppDir(appId);
  return path.join(appDir, 'plugin');
}

/**
 * 2つのオブジェクトの差分を取得（簡易版）
 */
function getDiff(obj1, obj2) {
  const diff = {};
  const allKeys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);
  
  for (const key of allKeys) {
    const val1 = obj1?.[key];
    const val2 = obj2?.[key];
    
    if (JSON.stringify(val1) !== JSON.stringify(val2)) {
      diff[key] = {
        old: val1,
        new: val2,
      };
    }
  }
  
  return diff;
}

module.exports = {
  ensureDirectory,
  readJsonFile,
  writeJsonFile,
  findAppDir,
  getAppDir,
  getFormDir,
  getPluginDir,
  getDiff,
};

