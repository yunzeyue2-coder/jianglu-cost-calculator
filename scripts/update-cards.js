#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const DIR = process.env.HOME + '/Library/CloudStorage/OneDrive-个人/项目工坊/食品库/产品卡';

// Read the full DeepSeek output from /tmp
const raw = fs.readFileSync(process.argv[2] || '/dev/stdin', 'utf-8');

// Split into individual cards by CD-XXX pattern
const cards = raw.split(/\n(?=CD-\d{3} )/).filter(b => b.trim() && !b.startsWith('好的，我'));

let count = 0;
cards.forEach(block => {
  const idMatch = block.match(/^CD-(\d{3})/);
  if (!idMatch) return;
  const num = idMatch[1];
  const id = 'CD-' + num;
  
  // Extract product name from first line
  const lines = block.split('\n');
  const nameLine = lines[0].replace(/^CD-\d{3}\s*/, '').trim();
  
  // Find existing file
  const existingFiles = fs.readdirSync(DIR).filter(f => f.startsWith(id + '_'));
  if (existingFiles.length === 0) {
    console.log('⚠️ 找不到 ' + id + '，跳过');
    return;
  }
  
  // Read existing file (to preserve出摊备料清单 and price)
  const existingPath = path.join(DIR, existingFiles[0]);
  const existing = fs.readFileSync(existingPath, 'utf-8');
  
  // Extract出摊备料清单 and price from existing
  const priceMatch = existing.match(/price:\s*(.+)/);
  const price = priceMatch ? priceMatch[1].trim() : '¥12-18';
  const tagsMatch = existing.match(/tags:\s*\[(.+)\]/);
  const tags = tagsMatch ? tagsMatch[1].trim() : '冷饮, 手打柠檬茶';
  
  // Extract 出摊备料清单 section (if exists)
  const stallMatch = existing.match(/## 出摊备料清单[\s\S]*?(?=## 免责|$)/);
  const stallSection = stallMatch ? stallMatch[0].trim() : '';
  const discMatch = existing.match(/## 免责声明[\s\S]*/);
  const discSection = discMatch ? discMatch[0].trim() : '';
  
  // Build new card content from DeepSeek output
  // Remove the title line (CD-XXX 产品名)
  let body = block.replace(/^CD-\d{3}\s+.+\n/, '').trim();
  
  // Remove any "（同CD-010）" references - replace with actual甜度标准 from CD-010
  body = body.replace(/（同CD-010）/g, '\n| 甜度 | 果糖用量 | 适用人群 |\n|------|---------|---------|\n| 全糖 | 50ml | 标准甜 |\n| 少糖 | 40ml | 怕甜 |\n| 半糖 | 25ml | 控糖 |\n| 微糖 | 15ml | 几乎不甜 |');
  
  // Build front matter
  const fm = `---
card-id: ${id}
product: ${nameLine}
price: ${price}
status: 已入库
date: 2026-05-29
tags: [${tags}]
---

> **酱卤老兵 · 工艺笔记**

`;
  
  // Assemble final file
  let final = fm + body.trim() + '\n\n';
  if (stallSection) final += stallSection + '\n\n';
  if (discSection) final += discSection;
  
  fs.writeFileSync(existingPath, final, 'utf-8');
  count++;
});

console.log('✅ 更新 ' + count + ' 张卡');
