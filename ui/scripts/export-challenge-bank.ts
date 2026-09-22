import fs from 'fs';
import path from 'path';
import { CHALLENGE_BANK } from '../src/services/challengeBank';

const outDir = path.resolve(process.cwd(), '../api/data');
fs.mkdirSync(outDir, { recursive: true });

const outFile = path.join(outDir, 'challenge_bank.json');
fs.writeFileSync(outFile, JSON.stringify(CHALLENGE_BANK, null, 2));

console.log(`Exported ${CHALLENGE_BANK.length} challenges to ${outFile}`);
