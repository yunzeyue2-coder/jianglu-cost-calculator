#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');

const REPO_DIR = '/tmp/kaku_repo';
const CARD_HTML = REPO_DIR + '/card.html';
const DATA_JSON = REPO_DIR + '/cards-data.json';
const CARDS_DIR = process.env.HOME + '/Library/CloudStorage/OneDrive-个人/项目工坊/食品库/产品卡';

// 1. Extract old CARDS from git
const oldHtml = execSync('cd ' + REPO_DIR + ' && git show 59d179b:card.html', { encoding: 'utf-8' });
const start = oldHtml.indexOf('const CARDS = [');
const end = oldHtml.indexOf('const CATS');
const cardsBlock = oldHtml.substring(start + 14, end).trim().replace(/,\s*$/, '');

// Parse old compact format {i:'CD-001',n:'脆皮冰淇淋块',c:'冷饮',m:'65%',p:IMG+'cd001.jpg',s:'夜市/学校'}
// Strategy: extract each { } block, manually parse key-value pairs
const oldCards = [];
const re = /{([^}]+)}/g;
let m;
while ((m = re.exec(cardsBlock)) !== null) {
  const inner = m[1];
  const obj = {};
  // Split by comma, but be careful with commas inside strings
  const pairs = inner.match(/([a-zA-Z]+):\s*('[^']*'|IMG\+'[^']*'|[^,]+)/g);
  if (pairs) {
    pairs.forEach(p => {
      const idx = p.indexOf(':');
      const k = p.substring(0, idx).trim();
      let v = p.substring(idx + 1).trim();
      // Handle IMG+'path'
      if (v.startsWith("IMG+")) {
        v = v.replace(/^IMG\+/, '').replace(/'/g, '');
      } else {
        v = v.replace(/'/g, '');
      }
      obj[k] = v;
    });
  }
  if (obj.i) oldCards.push(obj);
}

console.log('Old CARDS parsed:', oldCards.length);
if (oldCards.length > 0) {
  console.log('First:', JSON.stringify(oldCards[0]));
  console.log('Last:', JSON.stringify(oldCards[oldCards.length - 1]));
}

// 2. Read new markdown cards
const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.md') && !f.startsWith('_'));
const newCards = [];

files.forEach(file => {
  const content = fs.readFileSync(CARDS_DIR + '/' + file, 'utf-8');
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fmMatch) return;
  
  const fm = {};
  fmMatch[1].split('\n').forEach(line => {
    const idx = line.indexOf(':');
    if (idx > 0) fm[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
  });
  
  const id = fm['card-id'];
  const name = fm['product'];
  if (!id || !name) return;
  
  let tags = [];
  if (fm['tags']) {
    tags = fm['tags'].replace(/[\[\]]/g, '').split(',').map(t => t.trim());
  }
  
  const catMap = { '鲜制肉品':'鲜制肉品', '调味料':'调味料', '小吃':'小吃', '面点':'面点', '冷饮':'冷饮', '汤品':'汤品' };
  let category = '小吃';
  for (const t of tags) { if (catMap[t]) { category = catMap[t]; break; } }
  
  const marginMatch = content.match(/预估毛利\s*[|:]\s*([\d-%]+)/);
  const margin = marginMatch ? marginMatch[1] : '--';
  
  const scene = tags.filter(t => !catMap[t]).join('/');
  
  newCards.push({ i: id, n: name, c: category, m: margin, p: '', s: scene });
});

console.log('New markdown cards:', newCards.length);

// 3. Merge: old first (keep image paths), then new (avoid dup by id)
const newIds = new Set(newCards.map(c => c.i));
const filteredOld = oldCards.filter(c => !newIds.has(c.i));
const mergedCards = [...filteredOld, ...newCards];

console.log('Merged total:', mergedCards.length);
console.log('Old kept:', filteredOld.length, 'New added:', newCards.length);

// 4. Load old JSON details
let oldJSON = {};
try {
  oldJSON = JSON.parse(fs.readFileSync(DATA_JSON, 'utf-8'));
} catch(e) {
  console.log('No old JSON, starting fresh');
}

// Generate details for new cards from markdown
newCards.forEach(c => {
  const file = fs.readdirSync(CARDS_DIR).find(f => f.startsWith(c.i));
  if (!file) return;
  const content = fs.readFileSync(CARDS_DIR + '/' + file, 'utf-8');
  
  const detail = {};
  
  // 配方 table
  const recipeTable = [];
  const tMatch = content.match(/\| 原料[^|]*\| 用量[^|]*\|.*?\n\|[-| ]+\n([\s\S]*?)(?=\n\n|\n## )/);
  if (tMatch) {
    tMatch[1].split('\n').forEach(line => {
      const cols = line.split('|').filter(c => c.trim());
      if (cols.length >= 3) recipeTable.push([cols[0].trim(), cols[1].trim(), '', cols[2] ? cols[2].trim() : '']);
    });
  }
  if (recipeTable.length > 0) detail['配方'] = recipeTable;
  
  // SOP
  const sopSteps = [];
  const sopMatch = content.match(/## 锅里的事\n([\s\S]*?)(?=\n## )/);
  if (sopMatch) {
    sopMatch[1].split('\n').forEach(line => {
      const t = line.trim();
      if (t && !t.startsWith('#') && !t.startsWith('|')) sopSteps.push(t);
    });
  }
  if (sopSteps.length > 0) detail['SOP'] = sopSteps;
  
  // 毛利
  const marginMatch = content.match(/预估毛利\s*[|:]\s*([\d-%]+)/);
  if (marginMatch) detail['毛利'] = '毛利用' + marginMatch[1];
  
  // 常见问题 (from 别踩的坑)
  const pitMatch = content.match(/## 别踩的坑\n([\s\S]*?)(?=\n## )/);
  if (pitMatch) detail['常见问题'] = pitMatch[1].trim();
  
  // 变体 (从下次试试)
  const varMatch = content.match(/## 下次试试\n([\s\S]*?)(?=\n## )/);
  if (varMatch) detail['变体'] = varMatch[1].trim();
  
  // 美食故事 (从老兵说)
  const storyMatch = content.match(/## 老兵说\n([\s\S]*?)(?=\n## )/);
  if (storyMatch) detail['美食故事'] = storyMatch[1].trim();
  
  oldJSON[c.i] = { ...oldJSON[c.i], ...detail };
});

console.log('Total detail entries:', Object.keys(oldJSON).length);

// 5. Write updated files
const currentHtml = fs.readFileSync(CARD_HTML, 'utf-8');
const newHtml = currentHtml
  .replace(/const CARDS = \[[\s\S]*?\]\nconst CATS/, 
    'const CARDS = ' + JSON.stringify(mergedCards, null, 2) + '\nconst CATS')
  .replace(/(<span style="font-size:12px;color:#999">)\d+(张<\/span>)/, 
    '$1' + mergedCards.length + '$2');

fs.writeFileSync(CARD_HTML, newHtml, 'utf-8');
console.log('card.html updated');

fs.writeFileSync(DATA_JSON, JSON.stringify(oldJSON, null, 2), 'utf-8');
console.log('cards-data.json updated');

// 6. Deploy
try {
  execSync('cd ' + REPO_DIR + ' && git add -A && git commit -m "咔库合并: ' + mergedCards.length + '张 (旧' + filteredOld.length + '+新' + newCards.length + ')" --allow-empty', { stdio: 'pipe' });
  execSync('cd ' + REPO_DIR + ' && git push origin main', { stdio: 'pipe' });
  console.log('Deployed to GitHub Pages!');
} catch(e) {
  console.log('Push error:', e.message);
}
