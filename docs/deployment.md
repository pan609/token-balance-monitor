# 服务器部署

这份文档面向想自托管移动端摘要接口的使用者。推荐模式是：

- Node.js 服务只监听 `127.0.0.1:5173`。
- Nginx 或 Caddy 对外提供 HTTPS。
- iPhone App、Widget、Scriptable 只访问 `/api/mobile/summary`。
- 云厂商 AccessKey 只保存在服务器 `.env`，不要放进 iPhone、浏览器前端或公开仓库。

## 1. 准备服务器

以下以 Ubuntu 为例。服务器需要 Node.js 20+、Git 和 Nginx。

```bash
sudo apt update
sudo apt install -y git nginx

# 用你习惯的方式安装 Node.js 20+ 后继续
node -v
npm -v
```

拉取项目：

```bash
sudo mkdir -p /opt/token-balance-monitor
sudo chown "$USER":"$USER" /opt/token-balance-monitor
git clone https://github.com/pan609/token-balance-monitor.git /opt/token-balance-monitor
cd /opt/token-balance-monitor
```

安装依赖和构建前端：

```bash
cp .env.example .env
nano .env

npm ci
npm run build
```

## 2. 配置 `.env`

服务器 `.env` 至少建议设置：

```bash
NODE_ENV=production
HOST=127.0.0.1
PORT=5173
MOBILE_API_TOKEN=replace-with-long-random-token
MOBILE_ALERT_THRESHOLD_CNY=2
PRIMARY_PROVIDER_ID=aliyun
BALANCE_POLL_ENABLED=true
BALANCE_POLL_INTERVAL_MS=60000
BALANCE_HISTORY_RETENTION_DAYS=30
USAGE_INGEST_TOKEN=replace-with-another-long-random-token
USAGE_USER_HASH_SALT=replace-with-stable-random-salt

# 按需填入平台 key
ALIYUN_ACCESS_KEY_ID=
ALIYUN_ACCESS_KEY_SECRET=
DEEPSEEK_API_KEY=
VOLCENGINE_ACCESS_KEY_ID=
VOLCENGINE_SECRET_ACCESS_KEY=
VOLCENGINE_REGION=cn-beijing
```

生成移动端 token：

```bash
openssl rand -hex 32
```

先手动启动确认服务正常：

```bash
NODE_ENV=production node server/index.mjs
curl http://127.0.0.1:5173/api/health
```

另开一个终端测试移动端摘要接口：

```bash
curl -H "Authorization: Bearer 你的MOBILE_API_TOKEN" \
  http://127.0.0.1:5173/api/mobile/summary
```

余额历史默认写入 `/opt/token-balance-monitor/data/balance-snapshots.jsonl`，用于 Web 看板的小时消耗估算。这个目录不要提交到仓库；如需备份，只备份数据文件即可。

请求级 token 用量默认写入 `/opt/token-balance-monitor/data/usage-events.jsonl`。业务项目上报到 `/api/usage/events` 时需要带：

```bash
curl -X POST https://balance.example.com/api/usage/events \
  -H "Authorization: Bearer 你的USAGE_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "aliyun",
    "model": "qwen-plus",
    "projectId": "my-app",
    "environment": "production",
    "accountId": "workspace-a",
    "accountName": "默认工作区",
    "actorId": "user_123",
    "actorName": "张三",
    "feature": "chat_completion",
    "operationName": "智能问答",
    "resourceType": "conversation",
    "resourceId": "conv_abc",
    "requestId": "req_abc",
    "promptTokens": 1200,
    "completionTokens": 340,
    "totalTokens": 1540,
    "durationMs": 1800,
    "attributes": {
      "source": "chat_box"
    }
  }'
```

默认不记录 prompt 和 response。`feature`、`accountId`、`actorId`、`resourceType` 这类 ID 字段用于聚合，`operationName`、`accountName`、`actorName`、`resourceName` 只用于展示。旧字段仍然兼容：`userId` 会映射到 `actorId` 并生成匿名哈希，`metadata.usage_context` 会映射到 `attributes`。

## 3. systemd 常驻

确认 Node 路径：

```bash
which node
```

创建 systemd 服务：

```bash
sudo tee /etc/systemd/system/token-balance-monitor.service >/dev/null <<'EOF'
[Unit]
Description=Token Balance Monitor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/token-balance-monitor
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=5173
ExecStart=/usr/bin/node server/index.mjs
Restart=always
RestartSec=5
User=YOUR_LINUX_USER

[Install]
WantedBy=multi-user.target
EOF
```

把 `YOUR_LINUX_USER` 替换成拥有 `/opt/token-balance-monitor` 目录权限的 Linux 用户。如果 `which node` 不是 `/usr/bin/node`，也要同步修改 `ExecStart`。

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now token-balance-monitor
sudo systemctl status token-balance-monitor
```

查看日志：

```bash
journalctl -u token-balance-monitor -f
```

## 4. Nginx 反向代理

建议使用独立域名或子域名，例如 `balance.example.com`。

```nginx
server {
    server_name balance.example.com;

    location /api/mobile/ {
        proxy_pass http://127.0.0.1:5173/api/mobile/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        # 如果要公开 Web 看板，强烈建议在这里加 Basic Auth 或 IP 限制。
        proxy_pass http://127.0.0.1:5173/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

启用配置后：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

再使用 Certbot、云厂商证书或 Caddy 自动 HTTPS。启用 HTTPS 后，摘要接口形如：

```text
https://balance.example.com/api/mobile/summary
```

验证：

```bash
curl -H "Authorization: Bearer 你的MOBILE_API_TOKEN" \
  https://balance.example.com/api/mobile/summary
```

## 5. 连接 iPhone App / Widget

在本机 Mac 的 `.env` 里填入服务器地址和同一个 token：

```bash
MOBILE_API_URL=https://balance.example.com/api/mobile/summary
MOBILE_API_TOKEN=和服务器一致的长随机字符串
```

重新生成 iOS 配置并安装：

```bash
./scripts/run-ios-device.sh
```

如果使用 Scriptable，把 [ios-scriptable-widget.js](ios-scriptable-widget.js) 里的 `API_URL` 改成：

```text
https://balance.example.com/api/mobile/summary?token=你的MOBILE_API_TOKEN
```

## 6. 更新代码

服务器上更新到最新版本：

```bash
cd /opt/token-balance-monitor
git pull
npm ci
npm run build
sudo systemctl restart token-balance-monitor
```

## 7. 安全建议

- 不要把 `.env`、服务器密码、移动端 token、云厂商 AccessKey 提交到仓库。
- 给阿里云、火山引擎等云厂商 key 使用最小权限。
- 如果 Web 看板对公网开放，建议使用 Basic Auth、IP allowlist 或 VPN。
- 移动端接口必须设置强随机 `MOBILE_API_TOKEN`。
- 优先使用 HTTPS，不建议让 iPhone 通过明文 HTTP 访问公网服务器。
- 如果任何 key、token 或服务器密码曾经出现在聊天记录、issue、日志或截图里，建议立即轮换。
