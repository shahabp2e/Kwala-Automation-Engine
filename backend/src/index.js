require('dotenv/config');
const express = require('express');
const cors    = require('cors');
const multer  = require('multer');
const fs      = require('fs');
const path    = require('path');

const { initDb, queryHistory, getDeploymentWithLogs, getStats, getLastDeploymentPerFile,
        getClient, saveContractDeployment, queryContractHistory, getCallEvent, queryCallEvents } = require('./db');
const { logEmitter }    = require('./logEmitter');
const { workflowState } = require('./workflowState');
const { deployWorkflow, getWorkflowFiles, getWalletInfo, YAML_DIR } = require('./deployService');
const logger            = require('./logger');
const { CHAINS, getPollUrl } = require('./chains');
const { triggerCall, handleWebhookEvent, fetchAndSaveActionLogTx } = require('./callService');

const SEEDED_WORKFLOWS = new Set([
  'AddressTrackingWithBlockNumber.yaml',
  'AddressWithAddress.yaml',
  'AddressWithOrcalePrice.yaml',
  'AddressWithTime.yaml',
  'BlockNumberListeningOnKalp1906.yaml',
  'BlockNumber_NA_With_ActionCall_SmartContract.yaml',
  'BlockNumber_TimeInterval_ActionDeploySmartContract.yaml',
  'Blocknumberwithadd.yaml',
  'Blocknumber_WithEvent_Action_APICall.yaml',
  'BlockNumberWithOraclePrices.yaml',
  'BlockNumberWithTimeInterval.yaml',
  'DeploySmartContract943.yaml',
  'Event_NA_With_APICall.yaml',
  'EventWithAddressTrackingOnKalp1906.yaml',
  'EvenWithEventOnKalp1910.yaml',
  'Immediate_NA_ActionAPI.yaml',
  'Immediate_Time_Interval_Action_Post_API_Call.yaml',
  'Oracleprice_with_NA_Action_API_Call.yaml',
  'OraclePrice_With_OraclePrice_Action_Post_API_CALL.yaml',
  'RegressionEventWIthEvent.yaml',
  'Sepolia_Timestamp_With__Event_Action_Deploy_smart_contract.yaml',
  'Timestamp_With_Event_Action_API_CAll.yaml',
  'Timestamp_WithNA_ActionCallSmartContract.yaml',
  'Timestamp_WithOraclePrice_ActionCallSmartContract.yaml',
  'address_tracking.yaml',
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, YAML_DIR),
    filename:    (_req,  file, cb) => cb(null, file.originalname),
  }),
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    if (name.endsWith('.yaml') || name.endsWith('.yml')) cb(null, true);
    else cb(new Error('Only .yaml / .yml files are allowed'));
  },
  limits: { fileSize: 512 * 1024 },
});

const app         = express();
const PORT        = parseInt(process.env.PORT || '3001', 10);
let   server;
const sseClients  = new Set();

app.use(cors());
app.use(express.json());

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), db: 'sqlite' });
});

// ── Workflows ─────────────────────────────────────────────────────────────────
app.get('/workflows', async (_req, res) => {
  try {
    const [files, wallet] = await Promise.all([getWorkflowFiles(), getWalletInfo()]);
    const workflows = files.map(filename => {
      const state = workflowState.get(filename);
      const base  = state ?? { filename, name: filename.replace(/\.(yaml|yml)$/i, ''), status: 'idle' };
      return { ...base, isDeletable: !SEEDED_WORKFLOWS.has(filename) };
    });
    res.json({ workflows, wallet });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── Deploy single ─────────────────────────────────────────────────────────────
app.post('/deploy', async (req, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: 'filename required' });

  const current = workflowState.get(filename);
  if (current?.status === 'verifying' || current?.status === 'deploying') {
    return res.status(409).json({ error: 'Already deploying' });
  }

  deployWorkflow(filename).catch(err => logger.error('deployWorkflow error', { err }));
  res.json({ started: true, filename });
});

// ── Deploy all ────────────────────────────────────────────────────────────────
app.post('/deploy-all', async (_req, res) => {
  const files   = await getWorkflowFiles();
  const pending = files.filter(f => {
    const s = workflowState.get(f)?.status;
    return s !== 'verifying' && s !== 'deploying';
  });
  if (pending.length === 0) {
    return res.status(409).json({ error: 'All workflows already deploying' });
  }

  logEmitter.emit('log', {
    timestamp: new Date().toISOString(), level: 'info',
    message: `═══ Deploy All started: ${pending.length} workflows ═══`,
  });

  (async () => {
    let ok = 0, fail = 0;
    for (const file of pending) {
      await deployWorkflow(file);
      workflowState.get(file)?.status === 'deployed' ? ok++ : fail++;
      if (pending.indexOf(file) < pending.length - 1) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }
    logEmitter.emit('log', {
      timestamp: new Date().toISOString(), level: 'success',
      message: `═══ Deploy All complete — ✓ ${ok} deployed, ✗ ${fail} failed ═══`,
    });
  })().catch(err => logger.error('deploy-all error', { err }));

  res.json({ started: true, total: pending.length });
});

// ── History ───────────────────────────────────────────────────────────────────
app.get('/history', async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page  || '1',  10));
  const limit  = Math.min(100, parseInt(req.query.limit || '20', 10));
  const status = req.query.status;
  const search = req.query.search;

  const { rows, total } = await queryHistory({ page, limit, status, search });
  res.json({ deployments: rows, total, page, limit });
});

// ── Deployment detail + logs ──────────────────────────────────────────────────
app.get('/history/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  const result = await getDeploymentWithLogs(id);
  if (!result) return res.status(404).json({ error: 'Not found' });
  res.json(result);
});

// ── Stats ─────────────────────────────────────────────────────────────────────
app.get('/stats', async (_req, res) => {
  const stats = await getStats();
  res.json(stats);
});

// ── SSE Logs ──────────────────────────────────────────────────────────────────
app.get('/logs', (req, res) => {
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache, no-transform');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  sseClients.add(res);

  const send = (entry) => res.write(`data: ${JSON.stringify(entry)}\n\n`);
  logEmitter.on('log', send);
  const hb = setInterval(() => res.write(': heartbeat\n\n'), 20_000);

  req.on('close', () => {
    sseClients.delete(res);
    logEmitter.off('log', send);
    clearInterval(hb);
  });
});

// ── Get raw YAML ──────────────────────────────────────────────────────────────
app.get('/workflows/:filename/yaml', (req, res) => {
  const { filename } = req.params;
  if (/[/\\]|\.\./.test(filename)) return res.status(400).json({ error: 'Invalid filename' });
  const filepath = path.join(YAML_DIR, filename);
  try {
    const content = fs.readFileSync(filepath, 'utf-8');
    res.type('text/plain').send(content);
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

// ── Upload YAML ───────────────────────────────────────────────────────────────
app.post('/upload-yaml', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const filepath  = path.join(YAML_DIR, req.file.filename);
  const expiresIn = Math.floor(Date.now() / 1000) + 30 * 60;
  try {
    let content = fs.readFileSync(filepath, 'utf-8');
    if (/^\s*ExpiresIn:\s*.+$/m.test(content)) {
      content = content.replace(/^(\s*)ExpiresIn:\s*.+$/m, `$1ExpiresIn: ${expiresIn}`);
    } else {
      content = content.replace(/^(\s*ExecuteAfter:.+)$/m, `$1\n  ExpiresIn: ${expiresIn}`);
    }
    fs.writeFileSync(filepath, content, 'utf-8');
  } catch { /* non-fatal */ }

  res.json({ filename: req.file.filename, size: req.file.size });
});

// ── Delete workflow ───────────────────────────────────────────────────────────
app.delete('/workflows/:filename', (req, res) => {
  const { filename } = req.params;
  if (/[/\\]|\.\./.test(filename)) return res.status(400).json({ error: 'Invalid filename' });
  if (SEEDED_WORKFLOWS.has(filename)) return res.status(403).json({ error: 'Seeded workflows cannot be deleted' });
  const filepath = path.join(YAML_DIR, filename);
  try {
    fs.unlinkSync(filepath);
    workflowState.delete(filename);
    res.json({ deleted: true });
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

// ── Chains ────────────────────────────────────────────────────────────────────
app.get('/chains', (_req, res) => {
  const chains = Object.entries(CHAINS).map(([key, cfg]) => ({
    key,
    displayName:   cfg.displayName,
    deployChainId: cfg.deployChainId,
  }));
  res.json({ chains });
});

// ── POC Deploy: Trigger ───────────────────────────────────────────────────────
app.post('/chains/:chainKey/trigger', async (req, res) => {
  const { chainKey } = req.params;
  const chain = CHAINS[chainKey];
  if (!chain) return res.status(404).json({ success: false, message: `Unknown chain: ${chainKey}` });

  const TRANSACTION_API_URL = process.env.TRANSACTION_SERVICE_API_URL;
  const BACKEND_WALLET      = process.env.BACKEND_WALLET;
  if (!TRANSACTION_API_URL || !BACKEND_WALLET) {
    return res.status(500).json({ success: false, message: 'TRANSACTION_SERVICE_API_URL or BACKEND_WALLET env var not set' });
  }

  try {
    const timestamp = Date.now();
    logger.info(`[TRIGGER:${chainKey}] contract=${chain.triggerContract} chainId=${chain.triggerChainId}`);

    const response = await fetch(`${TRANSACTION_API_URL}/sendTransaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chainId:           chain.triggerChainId,
        contractAddress:   chain.triggerContract,
        functionSignature: chain.triggerFunction,
        backendWallet:     BACKEND_WALLET,
        args:              [timestamp.toString()],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Transaction API error ${response.status}: ${errText}`);
    }

    const data    = await response.json();
    const queueId = data.queueId ?? data.queue_id ?? null;
    logger.info(`[TRIGGER:${chainKey}] queued queueId=${queueId}`);
    res.json({ success: true, queueId, timestamp });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[TRIGGER:${chainKey}] ${msg}`);
    res.status(500).json({ success: false, message: msg });
  }
});

// ── POC Deploy: Poll ──────────────────────────────────────────────────────────
app.get('/chains/:chainKey/poll', async (req, res) => {
  const { chainKey } = req.params;
  if (!CHAINS[chainKey]) return res.status(404).json({ success: false, message: `Unknown chain: ${chainKey}` });

  try {
    const pollUrl  = getPollUrl(chainKey);
    const response = await fetch(pollUrl, { signal: AbortSignal.timeout(10_000) });

    if (!response.ok) throw new Error(`Kwala API error: ${response.status}`);

    const data = await response.json();
    const logs = data.action_logs ?? [];

    if (logs.length === 0) return res.json({ success: true, deployed: false });

    const latest          = logs.sort((a, b) => b.id - a.id)[0];
    const contractAddress = latest.chaincode_address;
    const txHash          = latest.txhash;
    const executionTime   = latest.execution_time;
    const createdAt       = latest.created_at;

    if (contractAddress) {
      const chain = CHAINS[chainKey];
      saveContractDeployment({
        chainKey,
        chainName:       chain.displayName,
        deployChainId:   chain.deployChainId,
        contractAddress,
        txHash,
        executionTime,
        triggeredAt:     createdAt,
      }).catch(err => logger.warn(`[POLL:${chainKey}] DB save failed: ${err instanceof Error ? err.message : err}`));
    }

    res.json({
      success:           true,
      deployed:          true,
      chaincode_address: contractAddress,
      txhash:            txHash,
      chain_id:          latest.chain_id,
      execution_time:    executionTime,
      created_at:        createdAt,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[POLL:${chainKey}] ${msg}`);
    res.status(500).json({ success: false, message: msg });
  }
});

// ── Contract deployment history ───────────────────────────────────────────────
app.get('/contract-history', async (req, res) => {
  const page     = Math.max(1, parseInt(req.query.page  || '1',  10));
  const limit    = Math.min(100, parseInt(req.query.limit || '20', 10));
  const chainKey = req.query.chainKey;

  try {
    const { rows, total } = await queryContractHistory({ page, limit, chainKey });
    res.json({ deployments: rows, total, page, limit });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── Call Contract: Trigger ────────────────────────────────────────────────────
app.post('/call/trigger/:chainKey', async (req, res) => {
  const { chainKey } = req.params;
  try {
    const { timestampArg, queueId } = await triggerCall(chainKey);
    res.json({ success: true, timestamp: timestampArg, queue_id: queueId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[CALL_TRIGGER:${chainKey}] ${msg}`);
    const status = msg.includes('not configured') || msg.includes('Unknown chain') ? 400 : 500;
    res.status(status).json({ success: false, error: msg });
  }
});

// ── Call Contract: Status ─────────────────────────────────────────────────────
app.get('/call/status/:chainKey', async (req, res) => {
  const { chainKey } = req.params;
  const ts = Number(req.query.timestamp);
  if (!ts || isNaN(ts)) return res.status(400).json({ error: 'timestamp query param required' });
  try {
    const row = await getCallEvent(chainKey, ts);
    if (!row) return res.status(404).json({ found: false });

    if (row.status === 'EVENT_RECEIVED' && !row.tx_hash) {
      fetchAndSaveActionLogTx(chainKey, ts).catch(err =>
        logger.warn(`[STATUS_POLL:${chainKey}] actionLog retry: ${err instanceof Error ? err.message : String(err)}`)
      );
    }

    res.json({ found: true, ...row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── Call Contract: History ────────────────────────────────────────────────────
app.get('/call/history', async (req, res) => {
  const chainKey = req.query.chainKey;
  const limit    = Math.min(100, parseInt(req.query.limit || '50', 10));
  try {
    const rows = await queryCallEvents({ chainKey, limit });
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── Call Contract: Webhooks ───────────────────────────────────────────────────
Object.keys(CHAINS).forEach(chainKey => {
  app.post(`/call/${chainKey}/dagRuns`, (req, res) => {
    handleWebhookEvent(chainKey, req.body)
      .then(() => res.status(200).send('OK'))
      .catch(err => {
        logger.error(`[WEBHOOK:${chainKey}] ${err instanceof Error ? err.message : String(err)}`);
        res.status(500).send('Webhook processing failed');
      });
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  await initDb();

  const lastStatuses = await getLastDeploymentPerFile();
  for (const [filename, { status, txHash, error, workflowName }] of lastStatuses) {
    const safeStatus = (status === 'deployed' || status === 'failed') ? status : 'failed';
    workflowState.set(filename, { filename, name: workflowName, status: safeStatus, txHash, error });
  }
  logger.info(`Hydrated workflowState: ${lastStatuses.size} workflow(s) restored from DB`);

  server = app.listen(PORT, () => logger.info(`Kwala backend → http://localhost:${PORT}`));
}

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received — shutting down gracefully…`);
  for (const res of sseClients) { try { res.end(); } catch { /* ignore */ } }
  sseClients.clear();
  server.close(() => {
    logger.info('HTTP server closed');
    const db = getClient();
    db.close();
    logger.info('DB connection closed');
    process.exit(0);
  });
  setTimeout(() => { logger.warn('Forced exit after 10s'); process.exit(1); }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

start();
