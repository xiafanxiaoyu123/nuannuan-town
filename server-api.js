// 独立 API 进程：生产环境可让 Nginx/Cloudflare 反代 /api 到这里。
const http = require('node:http');
const { handleApi } = require('./server/auth-api');
const PORT = Number(process.env.API_PORT || process.env.PORT || 3000);
http.createServer((req, res) => { Promise.resolve(handleApi(req, res)).catch((error) => { console.error(error); if (!res.headersSent) res.writeHead(500).end(); }); })
  .listen(PORT, '127.0.0.1', () => console.log(`暖暖小镇 API → http://127.0.0.1:${PORT}`));
