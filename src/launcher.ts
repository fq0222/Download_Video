import { openBrowser } from './runtime.js';
import { startServer } from './server.js';

startServer({
  onListening: ({ url }) => {
    console.log(`[startup] opening browser: ${url}`);
    openBrowser(url);
  }
});
