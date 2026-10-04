import { readFile } from 'node:fs/promises';
import { accessSync, constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = path.join(root, 'fukuoka-trip.html');
const statusPath = path.join(root, 'PROJECT_STATUS.md');
const agentsPath = path.join(root, 'AGENTS.md');
const errors = [];

function requireFile(filePath, label) {
  try {
    accessSync(filePath, constants.R_OK);
  } catch {
    errors.push(`${label} 不存在或無法讀取：${path.relative(root, filePath)}`);
  }
}

requireFile(htmlPath, '主要頁面');
requireFile(statusPath, '專案狀態文件');
requireFile(agentsPath, 'Codex 規則文件');

let html = '';
try {
  html = await readFile(htmlPath, 'utf8');
} catch {
  // The missing-file error above is more useful than a second stack trace.
}

let trip;
if (html) {
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/i);
  if (!scriptMatch) {
    errors.push('找不到主要 inline JavaScript。');
  } else {
    try {
      // Parse only. The browser-dependent code is intentionally not executed.
      new Function(scriptMatch[1]);
    } catch (error) {
      errors.push(`JavaScript syntax error：${error.message}`);
    }
  }

  const tripStart = html.indexOf('const TRIP = ');
  const tripEnd = html.indexOf('// Pure rendering helpers.', tripStart);
  if (tripStart < 0 || tripEnd < 0) {
    errors.push('找不到可解析的 TRIP 行程資料。');
  } else {
    const source = html.slice(tripStart + 'const TRIP = '.length, tripEnd).trim().replace(/;$/, '');
    try {
      trip = JSON.parse(source);
    } catch (error) {
      errors.push(`TRIP 資料不是有效 JSON：${error.message}`);
    }
  }
}

if (trip) {
  const dayIds = new Set(Array.isArray(trip.days) ? trip.days.map(day => day.id) : []);
  for (let day = 1; day <= 5; day += 1) {
    if (!dayIds.has(day)) errors.push(`缺少 Day ${day} 行程資料。`);
  }

  const tripContent = JSON.stringify(trip);
  const staticVisibleContent = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ');
  const publicContent = `${staticVisibleContent}\n${tripContent}`;
  const requiredContent = [
    'Minn Hakata Station East',
    'activity/152315',
    '前田屋',
    'Maidreamin',
    '元祖 本吉屋',
    '焼肉の牛太 本陣'
  ];
  for (const item of requiredContent) {
    if (!tripContent.includes(item)) errors.push(`缺少重要內容：${item}`);
  }

  const forbiddenContent = ['BEAMS', 'Yojono bi', '余情の美', '租車', '自駕', 'ETC', 'NOC', '冬季輪胎'];
  for (const item of forbiddenContent) {
    if (publicContent.includes(item)) errors.push(`公開行程資料出現禁止或已淘汰內容：${item}`);
  }

  const locations = trip.mapLocations;
  if (!locations || typeof locations !== 'object' || Array.isArray(locations)) {
    errors.push('mapLocations 不存在或格式錯誤。');
  } else {
    for (const [key, location] of Object.entries(locations)) {
      if (!location || typeof location !== 'object') {
        errors.push(`mapLocations.${key} 格式錯誤。`);
        continue;
      }
      if (typeof location.title !== 'string' || !location.title.trim()) {
        errors.push(`mapLocations.${key}.title 不可為空。`);
      }
      if (typeof location.query !== 'string' || !location.query.trim()) {
        errors.push(`mapLocations.${key}.query 不可為空。`);
      }
    }
  }
}

if (errors.length) {
  console.error('Trip validation failed');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Trip validation passed');
  console.log('- fukuoka-trip.html and inline JavaScript are valid');
  console.log('- Day 1–5 and required itinerary content are present');
  console.log('- forbidden and retired itinerary content is absent');
  console.log('- mapLocations entries contain title and query');
  console.log('- PROJECT_STATUS.md and AGENTS.md are present');
}
