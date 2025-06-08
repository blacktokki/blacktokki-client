import * as mathjs from 'mathjs';
import repl from 'repl';

import * as index from './src/index';
const r = repl.start({ prompt: '> ' });
Object.assign(r.context, index);
Object.assign(r.context, { mathjs });
Promise.all([index.kospiStorage.sync(), index.etfStorage.sync()]).then(() => {
  console.log("import * as mathjs from 'mathjs';");
  console.log('import {', Object.keys(index).join(', '), "} from 'src/index';");
  r.displayPrompt();
});
