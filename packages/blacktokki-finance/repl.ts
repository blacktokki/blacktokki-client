import * as mathjs from 'mathjs';
import repl from 'repl';

import * as index from './src/index';
const r = repl.start({ prompt: '> ' });
const imports = { ...index, mathjs };
Object.assign(r.context, imports);
Promise.all([index.kospiStorage.sync(), index.etfStorage.sync()]).then(() => {
  console.log('import 목록:', Object.keys(imports).join(', '));
  r.displayPrompt();
});
