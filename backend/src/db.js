require('dotenv/config');
const { createClient } = require('@libsql/client');
const path = require('path');
const fs   = require('fs');
const logger = require('./logger');

const DB_DIR  = path.resolve(path.join(__dirname, '..', '..', 'data'));
const DB_PATH = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(DB_DIR, 'kwala.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const DB_URL = `file:${DB_PATH.replace(/\\/g, '/')}`;

let _client;

function getClient() {
  if (!_client) _client = createClient({ url: DB_URL });
  return _client;
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS call_events (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    chain_key             TEXT    NOT NULL,
    chain_id              INTEGER NOT NULL,
    timestamp_argument    INTEGER NOT NULL,
    transaction_sent_time INTEGER NOT NULL,
    event_received_time   INTEGER,
    event_data            TEXT,
    latency_ms            INTEGER,
    tx_hash               TEXT,
    action_log_tx_hash    TEXT,
    queue_id              TEXT,
    status                TEXT    NOT NULL DEFAULT 'SENT',
    created_at            INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    UNIQUE(chain_key, timestamp_argument)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ce_chain_key  ON call_events(chain_key)`,
  `CREATE INDEX IF NOT EXISTS idx_ce_created_at ON call_events(created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS contract_deployments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    chain_key       TEXT    NOT NULL,
    chain_name      TEXT    NOT NULL,
    deploy_chain_id INTEGER NOT NULL,
    contract_address TEXT   NOT NULL,
    tx_hash         TEXT,
    execution_time  TEXT,
    triggered_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deployed_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cd_chain_key   ON contract_deployments(chain_key)`,
  `CREATE INDEX IF NOT EXISTS idx_cd_tx_hash     ON contract_deployments(tx_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_cd_deployed_at ON contract_deployments(deployed_at DESC)`,
  `CREATE TABLE IF NOT EXISTS deployments (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    filename      TEXT    NOT NULL,
    workflow_name TEXT    NOT NULL,
    status        TEXT    NOT NULL,
    tx_hash       TEXT,
    error         TEXT,
    started_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    completed_at  TEXT,
    duration_ms   INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS deploy_logs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    deployment_id INTEGER NOT NULL REFERENCES deployments(id),
    level         TEXT    NOT NULL,
    message       TEXT    NOT NULL,
    workflow      TEXT,
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_dep_filename   ON deployments(filename)`,
  `CREATE INDEX IF NOT EXISTS idx_dep_started_at ON deployments(started_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_dep_status     ON deployments(status)`,
  `CREATE INDEX IF NOT EXISTS idx_log_dep_id     ON deploy_logs(deployment_id)`,
];

async function initDb() {
  const db = getClient();
  for (const sql of SCHEMA_STATEMENTS) {
    await db.execute(sql);
  }
  logger.info(`SQLite ready: ${DB_PATH}`);
}

function rowToObj(row) {
  return Object.fromEntries(Object.entries(row));
}

async function createDeployment(filename, workflowName) {
  const db  = getClient();
  const res = await db.execute({
    sql:  `INSERT INTO deployments (filename, workflow_name, status) VALUES (?, ?, 'verifying')`,
    args: [filename, workflowName],
  });
  const id = Number(res.lastInsertRowid);
  if (!id || isNaN(id)) throw new Error(`DB insert returned invalid rowid: ${String(res.lastInsertRowid)}`);
  return id;
}

async function updateDeployment(id, fields) {
  const db = getClient();
  await db.execute({
    sql: `UPDATE deployments
          SET status=?, tx_hash=?, error=?, completed_at=?, duration_ms=?,
              workflow_name=COALESCE(?, workflow_name)
          WHERE id=?`,
    args: [
      fields.status,
      fields.txHash      ?? null,
      fields.error       ?? null,
      fields.completedAt ? fields.completedAt.toISOString() : null,
      fields.durationMs  ?? null,
      fields.workflowName ?? null,
      id,
    ],
  });
}

async function saveLog(deploymentId, level, message, workflow) {
  const db = getClient();
  await db.execute({
    sql:  `INSERT INTO deploy_logs (deployment_id, level, message, workflow) VALUES (?, ?, ?, ?)`,
    args: [deploymentId, level, message, workflow ?? null],
  });
}

async function queryHistory(opts) {
  const { page, limit, status, search } = opts;
  const offset = (page - 1) * limit;
  const db = getClient();

  const conditions = [];
  const params     = [];

  if (status && status !== 'all') { conditions.push('status = ?');                                  params.push(status); }
  if (search)                      { conditions.push('(filename LIKE ? OR workflow_name LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rowsRes, countRes] = await Promise.all([
    db.execute({ sql: `SELECT * FROM deployments ${where} ORDER BY started_at DESC LIMIT ? OFFSET ?`, args: [...params, limit, offset] }),
    db.execute({ sql: `SELECT COUNT(*) AS c FROM deployments ${where}`, args: [...params] }),
  ]);

  return {
    rows:  rowsRes.rows.map(rowToObj),
    total: Number(rowToObj(countRes.rows[0]).c),
  };
}

async function getDeploymentWithLogs(id) {
  const db = getClient();
  const [depRes, logsRes] = await Promise.all([
    db.execute({ sql: 'SELECT * FROM deployments WHERE id = ?', args: [id] }),
    db.execute({ sql: 'SELECT * FROM deploy_logs WHERE deployment_id = ? ORDER BY created_at ASC', args: [id] }),
  ]);
  if (!depRes.rows.length) return null;
  return {
    deployment: rowToObj(depRes.rows[0]),
    logs:       logsRes.rows.map(rowToObj),
  };
}

async function getLastDeploymentPerFile() {
  const db  = getClient();
  const res = await db.execute(`
    SELECT filename, workflow_name, status, tx_hash, error
    FROM   deployments
    WHERE  id IN (SELECT MAX(id) FROM deployments GROUP BY filename)
  `);
  const map = new Map();
  for (const row of res.rows) {
    const r = rowToObj(row);
    map.set(r.filename, {
      status:       r.status,
      txHash:       r.tx_hash  ?? undefined,
      error:        r.error    ?? undefined,
      workflowName: r.workflow_name,
    });
  }
  return map;
}

async function saveContractDeployment(fields) {
  const db = getClient();
  const dupConditions = ['contract_address = ?'];
  const dupArgs = [fields.contractAddress];
  if (fields.txHash) {
    dupConditions.push('tx_hash = ?');
    dupArgs.push(fields.txHash);
  }
  const dup = await db.execute({
    sql:  `SELECT id FROM contract_deployments WHERE ${dupConditions.join(' OR ')} LIMIT 1`,
    args: dupArgs,
  });
  if (dup.rows.length) return Number(rowToObj(dup.rows[0]).id);

  const res = await db.execute({
    sql: `INSERT INTO contract_deployments
            (chain_key, chain_name, deploy_chain_id, contract_address, tx_hash, execution_time, triggered_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      fields.chainKey,
      fields.chainName,
      fields.deployChainId,
      fields.contractAddress,
      fields.txHash        ?? null,
      fields.executionTime ? String(fields.executionTime) : null,
      fields.triggeredAt   ?? new Date().toISOString(),
    ],
  });
  return Number(res.lastInsertRowid);
}

async function queryContractHistory(opts) {
  const { page, limit, chainKey } = opts;
  const offset = (page - 1) * limit;
  const db = getClient();

  const conditions = [];
  const params     = [];
  if (chainKey && chainKey !== 'all') { conditions.push('chain_key = ?'); params.push(chainKey); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rowsRes, countRes] = await Promise.all([
    db.execute({ sql: `SELECT * FROM contract_deployments ${where} ORDER BY deployed_at DESC LIMIT ? OFFSET ?`, args: [...params, limit, offset] }),
    db.execute({ sql: `SELECT COUNT(*) AS c FROM contract_deployments ${where}`, args: params }),
  ]);

  return {
    rows:  rowsRes.rows.map(rowToObj),
    total: Number(rowToObj(countRes.rows[0]).c),
  };
}

async function saveCallEvent(fields) {
  const db = getClient();
  await db.execute({
    sql:  `INSERT INTO call_events (chain_key, chain_id, timestamp_argument, transaction_sent_time, status) VALUES (?, ?, ?, ?, 'SENT')`,
    args: [fields.chainKey, fields.chainId, fields.timestampArgument, fields.transactionSentTime],
  });
}

async function updateCallEventQueued(chainKey, timestampArg, queueId) {
  const db = getClient();
  await db.execute({
    sql:  `UPDATE call_events SET queue_id=? WHERE chain_key=? AND timestamp_argument=?`,
    args: [queueId, chainKey, timestampArg],
  });
}

async function updateCallEventFailed(chainKey, timestampArg) {
  const db = getClient();
  await db.execute({
    sql:  `UPDATE call_events SET status='FAILED' WHERE chain_key=? AND timestamp_argument=?`,
    args: [chainKey, timestampArg],
  });
}

async function updateCallEventReceived(chainKey, timestampArg, eventData, eventReceivedTime, latencyMs) {
  const db = getClient();
  const result = await db.execute({
    sql:  `UPDATE call_events SET event_data=?, event_received_time=?, latency_ms=?, status='EVENT_RECEIVED' WHERE chain_key=? AND timestamp_argument=?`,
    args: [eventData, eventReceivedTime, latencyMs, chainKey, timestampArg],
  });
  return result.rowsAffected;
}

async function updateCallEventTxHash(chainKey, timestampArg, txHash) {
  const db = getClient();
  await db.execute({
    sql:  `UPDATE call_events SET tx_hash=?, action_log_tx_hash=? WHERE chain_key=? AND timestamp_argument=?`,
    args: [txHash, txHash, chainKey, timestampArg],
  });
}

async function getCallEvent(chainKey, timestampArg) {
  const db  = getClient();
  const res = await db.execute({
    sql:  `SELECT * FROM call_events WHERE chain_key=? AND timestamp_argument=?`,
    args: [chainKey, timestampArg],
  });
  return res.rows.length ? rowToObj(res.rows[0]) : null;
}

async function isActionLogHashUsed(txHash, chainKey, excludeTimestampArg) {
  const db  = getClient();
  const res = await db.execute({
    sql:  `SELECT id FROM call_events WHERE (tx_hash = ? OR action_log_tx_hash = ?) AND chain_key = ? AND timestamp_argument != ? LIMIT 1`,
    args: [txHash, txHash, chainKey, excludeTimestampArg],
  });
  return res.rows.length > 0;
}

async function queryCallEvents(opts) {
  const { chainKey, limit = 50 } = opts;
  const db = getClient();
  if (chainKey && chainKey !== 'all') {
    const res = await db.execute({
      sql:  `SELECT * FROM call_events WHERE chain_key=? ORDER BY id DESC LIMIT ?`,
      args: [chainKey, limit],
    });
    return res.rows.map(rowToObj);
  }
  const res = await db.execute({
    sql:  `SELECT * FROM call_events ORDER BY id DESC LIMIT ?`,
    args: [limit],
  });
  return res.rows.map(rowToObj);
}

async function getStats() {
  const db = getClient();
  const [sumRes, chartRes, recentRes] = await Promise.all([
    db.execute(`
      SELECT
        COUNT(*)                                                                                        AS total,
        COALESCE(SUM(CASE WHEN status='deployed'               THEN 1 ELSE 0 END), 0)                  AS deployed,
        COALESCE(SUM(CASE WHEN status='failed'                 THEN 1 ELSE 0 END), 0)                  AS failed,
        COALESCE(SUM(CASE WHEN status IN ('verifying','deploying') THEN 1 ELSE 0 END), 0)              AS active,
        COALESCE(CAST(AVG(CASE WHEN status='deployed' THEN duration_ms END) AS INTEGER), 0)            AS avg_duration_ms,
        COALESCE(SUM(CASE WHEN started_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day') THEN 1 ELSE 0 END), 0) AS today
      FROM deployments
    `),
    db.execute(`
      SELECT substr(started_at,1,10) AS day,
             COUNT(*)                                              AS total,
             SUM(CASE WHEN status='deployed' THEN 1 ELSE 0 END)   AS deployed,
             SUM(CASE WHEN status='failed'   THEN 1 ELSE 0 END)   AS failed
      FROM deployments
      WHERE started_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')
      GROUP BY substr(started_at,1,10)
      ORDER BY day ASC
    `),
    db.execute(`SELECT * FROM deployments ORDER BY started_at DESC LIMIT 5`),
  ]);

  return {
    summary: rowToObj(sumRes.rows[0]),
    chart:   chartRes.rows.map(rowToObj),
    recent:  recentRes.rows.map(rowToObj),
  };
}

module.exports = {
  getClient, initDb, createDeployment, updateDeployment, saveLog,
  queryHistory, getDeploymentWithLogs, getLastDeploymentPerFile,
  saveContractDeployment, queryContractHistory,
  saveCallEvent, updateCallEventQueued, updateCallEventFailed,
  updateCallEventReceived, updateCallEventTxHash, getCallEvent,
  isActionLogHashUsed, queryCallEvents, getStats,
};
