#!/usr/bin/env node
/**
 * 咔库 · 产品卡 → H5数据转换部署脚本
 *
 * 工作流：
 * 1. 读取食品库/产品卡/ 下所有 .md 卡片
 * 2. 解析 front matter + 各章节
 * 3. 生成 card.html 中的 CARDS 阵列 + cards-data.json
 * 4. 推送到 GitHub Pages
 */

const fs = require('fs')
const path = require('path')

const CARDS_DIR = path.join(process.env.HOME, 'Library/CloudStorage/OneDrive-个人/项目工坊/食品库/产品卡')
const REPO_DIR = '/tmp/kaku_repo'
const CARD_HTML = path.join(REPO_DIR, 'card.html')
const DATA_JSON = path.join(REPO_DIR, 'cards-data.json')

// ---- 1. 读取所有卡片文件 ----
const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.md') && !f.startsWith('_'))

const cards = []
const details = {}

files.forEach(file => {
  const content = fs.readFileSync(path.join(CARDS_DIR, file), 'utf-8')
  
  // Parse front matter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/)
  if (!fmMatch) return
  
  const fm = {}
  fmMatch[1].split('\n').forEach(line => {
    const [k, ...v] = line.split(':')
    if (k) fm[k.trim()] = v.join(':').trim()
  })

  const id = fm['card-id']
  const name = fm['product']
  if (!id || !name) return
  
  // Parse tags
  let tags = []
  if (fm['tags']) {
    tags = fm['tags'].replace(/[\[\]]/g, '').split(',').map(t => t.trim())
  }
  
  // Determine category
  const catMap = {
    '鲜制肉品': '鲜制肉品',
    '调味料': '调味料',
    '小吃': '小吃',
    '面点': '面点',
    '冷饮': '冷饮',
    '汤品': '汤品'
  }
  let category = '小吃'
  for (const t of tags) {
    if (catMap[t]) { category = catMap[t]; break }
  }
  
  // Parse margin from 钱的事 section
  let margin = '--'
  const marginMatch = content.match(/预估毛利\s*[|:]\s*([\d-]+%)/)
  if (marginMatch) margin = marginMatch[1]
  
  // Parse 老兵说
  let story = ''
  const storyMatch = content.match(/## 老兵说\n([\s\S]*?)(?=\n## )/)
  if (storyMatch) story = storyMatch[1].trim()

  // Parse 配方 table
  const recipeTable = []
  const tableMatch = content.match(/\| 原料[^|]*\| 用量[^|]*\|.*?\n\|[-| ]+\n([\s\S]*?)(?=\n\n|\n## )/)
  if (tableMatch) {
    const lines = tableMatch[1].split('\n')
    lines.forEach(line => {
      const cols = line.split('|').filter(c => c.trim())
      if (cols.length >= 3) {
        recipeTable.push([
          cols[0].trim(),
          cols[1].trim(),
          '',
          cols[2] ? cols[2].trim() : ''
        ])
      }
    })
  }
  
  // Parse SOP (锅里的事)
  const sopSteps = []
  const sopMatch = content.match(/## 锅里的事\n([\s\S]*?)(?=\n## )/)
  if (sopMatch) {
    sopMatch[1].split('\n').forEach(line => {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('|') && !trimmed.startsWith('-')) {
        sopSteps.push(trimmed)
      }
    })
  }
  if (sopSteps.length === 0) sopSteps.push('见卡片详情（完整版需订阅）')
  
  // Parse 别踩的坑
  let pitfalls = ''
  const pitMatch = content.match(/## 别踩的坑\n([\s\S]*?)(?=\n## )/)
  if (pitMatch) pitfalls = pitMatch[1].trim()
  
  // Parse 下次试试 (variant)
  let variant = ''
  const varMatch = content.match(/## 下次试试\n([\s\S]*?)(?=\n## )/)
  if (varMatch) variant = varMatch[1].trim()
  
  // Parse 钱的事 (cost table)
  let marginModel = `建议售价: 见卡片详情`
  const costLines = []
  const costMatch = content.match(/## 钱的事\n\|[^|]+\|[^|]+\|\n\|[-| ]+\n([\s\S]*?)(?=\n## |\n## 关联)/)
  if (costMatch) {
    costMatch[1].split('\n').forEach(line => {
      const cols = line.split('|').filter(c => c.trim())
      if (cols.length >= 2) costLines.push(`${cols[0].trim()}: ${cols[1].trim()}`)
    })
    if (costLines.length > 0) marginModel = costLines.join(' / ')
  }
  
  // Build CARDS entry
  const scene = tags.filter(t => !['鲜制肉品','调味料','小吃','面点','冷饮','汤品'].includes(t)).join('/')
  
  cards.push({
    i: id,
    n: name,
    c: category,
    m: margin,
    p: '', // image placeholder, will be filled later
    s: scene
  })
  
  // Build details
  const detail = {}
  if (recipeTable.length > 0) detail['配方'] = recipeTable
  if (sopSteps.length > 0) detail['SOP'] = sopSteps
  if (marginModel) detail['毛利'] = marginModel
  if (pitfalls) detail['常见问题'] = pitfalls
  if (variant) detail['变体'] = variant
  
  // Parse cost/equipment from 钱的事 table
  const costData = {}
  const costRowsMatch = content.match(/## 钱的事\n\|[^|]+\|[^|]+\|\n\|[-| ]+\n([\s\S]*?)(?=\n## )/)
  if (costRowsMatch) {
    costRowsMatch[1].split('\n').forEach(line => {
      const cols = line.split('|').filter(c => c.trim())
      if (cols.length >= 2) costData[cols[0].trim()] = cols[1].trim()
    })
  }
  if (costData['单份成本'] || costData['单只成本'] || costData['每斤面料成本']) {
    detail['毛利'] = '成本: ' + (costData['单份成本'] || costData['单只成本'] || costData['每斤面料成本']) + ' | 毛利: ' + margin
  }
  
  details[id] = detail
})

console.log(`✅ 解析完成: ${cards.length} 张卡片`)

// ---- 2. 备份旧数据 ----
const oldCardHTML = fs.readFileSync(CARD_HTML, 'utf-8')
const oldJSON = JSON.parse(fs.readFileSync(DATA_JSON, 'utf-8'))

// Merge with old data (keep old card data for existing cards, add new ones)
const mergedDetails = { ...oldJSON }

// Merge old CARDS with new (avoid duplicates by id)
const oldCardMatch = oldCardHTML.match(/const CARDS = \[([\s\S]*?)\]/)
let oldCards = []
if (oldCardMatch) {
  try {
    eval('oldCards = ' + oldCardMatch[0].replace('const CARDS = ', ''))
  } catch(e) {
    console.log('Warning: could not parse old CARDS')
  }
}

// Remove old cards that have new versions
const newIds = new Set(cards.map(c => c.i))
const filteredOldCards = oldCards.filter(c => !newIds.has(c.i))

// Merge: old cards first, then new cards
const mergedCards = [...filteredOldCards, ...cards]

// For new cards, merge detail into oldJSON
cards.forEach(c => {
  if (details[c.i]) {
    mergedDetails[c.i] = { ...mergedDetails[c.i], ...details[c.i] }
  }
})

console.log(`ℹ️ 旧卡保留: ${filteredOldCards.length}, 新卡添加: ${cards.length}, 总计: ${mergedCards.length}`)

// ---- 3. 生成新的 card.html ----
const newCardHTML = oldCardHTML
  .replace(/const CARDS = \[[\s\S]*?\]/, 
    'const CARDS = ' + JSON.stringify(mergedCards, null, 2))
  .replace(/(<span style="font-size:12px;color:#999">)\d+(张<\/span>)/, 
    `$1${mergedCards.length}$2`)

fs.writeFileSync(CARD_HTML, newCardHTML, 'utf-8')
console.log('✅ card.html 已更新')

// ---- 4. 生成新的 cards-data.json ----
fs.writeFileSync(DATA_JSON, JSON.stringify(mergedDetails, null, 2), 'utf-8')
console.log('✅ cards-data.json 已更新 (' + Object.keys(mergedDetails).length + ' 条数据)')

// ---- 5. Deploy to GitHub Pages ----
console.log('\n--- 开始部署 ---')
const { execSync } = require('child_process')
try {
  execSync('cd ' + REPO_DIR + ' && git add -A && git commit -m "咔库更新: ' + mergedCards.length + '张卡" --allow-empty', { stdio: 'pipe' })
  execSync('cd ' + REPO_DIR + ' && git push origin main', { stdio: 'pipe' })
  console.log('✅ 已推送到 GitHub Pages')
} catch(e) {
  console.log('⚠️ 推送失败（可能无变更或无权限）:', e.message)
}
