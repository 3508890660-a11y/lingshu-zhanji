import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [id, status = 'running', progress = '50', phase = '执行中', note = ''] = process.argv.slice(2);
if (!/^[a-zA-Z0-9._-]+$/.test(id)) throw new Error('非法的 subagent 标识');
const dir = path.join(ROOT, 'agents', 'progress');
fs.mkdirSync(dir, { recursive: true });
const payload = {
  id,
  status,
  progress: Math.max(0, Math.min(100, Number(progress) || 0)),
  phase,
  note,
  updatedAt: new Date().toISOString()
};
fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload));
