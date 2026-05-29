#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const OUT = process.env.HOME + '/Library/CloudStorage/OneDrive-个人/项目工坊/食品库/产品卡';
const INDEX = OUT + '/产品卡索引.md';
const RAW = '/tmp/lemontea_raw.txt';

const PRICE = {
  '009':'¥12-18','010':'¥13-18','011':'¥12-18','013':'¥12-18',
  '012':'¥14-20','016':'¥14-20','022':'¥14-20',
  '015':'¥13-18','017':'¥13-18','018':'¥13-18','019':'¥13-18',
  '020':'¥12-17','021':'¥13-18','023':'¥13-18','024':'¥13-18',
  '006':'¥13-18','007':'¥12-17','008':'¥14-20',
  '025':'¥14-20','026':'¥14-20','027':'¥14-20','028':'¥14-20',
  '029':'¥14-20','030':'¥13-18',
  '032':'¥14-20','033':'¥14-20','034':'¥15-22','036':'¥15-22',
  '031':'¥22-28','042':'¥25-30','043':'¥25-30','044':'¥25-30','045':'¥25-30',
  '046':'¥14-20','047':'¥14-20',
  '035':'¥16-22','048':'¥16-22',
  '037':'¥15-22','038':'¥15-22',
};

const raw = fs.readFileSync(RAW, 'utf-8');
const blocks = raw.split(/---\n/).filter(b => b.trim());
let count = 0, dupes = 0, skip = 0;

blocks.forEach(block => {
  const idM = block.match(/card-id:\s*(CD-\d+)/);
  if (!idM) { skip++; return; }
  const id = idM[1], num = id.replace('CD-', '');
  const nameM = block.match(/product:\s*(.+)/);
  const name = nameM ? nameM[1].trim() : id;
  
  if (id === 'CD-040') { dupes++; return; }
  if (parseInt(num) >= 49) { skip++; return; }
  
  let content = block;
  if (PRICE[num]) content = content.replace(/¥1[59]\.9/g, PRICE[num]).replace(/¥2[25]\.0/g, PRICE[num]).replace(/¥22\.0/g, PRICE[num]);
  
  const fm = '---\ncard-id: ' + id + '\nproduct: ' + name + '\nprice: ' + (PRICE[num]||'¥19.9') + '\nstatus: 待入库\ndate: 2026-05-29\ntags: [冷饮, 手打柠檬茶, 夏季爆品]\n---\n\n';
  content = content.replace(/^---[\s\S]*?---\n/, '');
  
  const safe = name.replace(/[\/\s#]+/g, '_').substring(0, 25);
  fs.writeFileSync(path.join(OUT, id + '_' + safe + '.md'), fm + content.trim(), 'utf-8');
  count++;
  fs.appendFileSync(INDEX, '| ' + id + ' | ' + name + ' | 冷饮 | ' + (PRICE[num]||'--') + ' |\n');
});

console.log('✅ 写入' + count + '张，跳过' + dupes + '张重复+' + skip + '张辅料');
