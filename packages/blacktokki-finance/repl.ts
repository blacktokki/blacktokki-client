import repl from 'repl';

import * as index from './src/index';
import { sync_stock } from './src/utils';
const r = repl.start({ prompt: '> ' });
Object.assign(r.context, index);
sync_stock().then(() => {
  console.log('import 목록:', Object.keys(index).join(', '));
  r.displayPrompt();
});
