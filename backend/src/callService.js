const {
  saveCallEvent, updateCallEventQueued, updateCallEventFailed,
  updateCallEventReceived, updateCallEventTxHash, getCallEvent, isActionLogHashUsed,
} = require('./db');
const { CHAINS } = require('./chains');
const logger = require('./logger');

const KWALA_LOG_BASE = 'https://web2-backend.kwala.network/workflow';
const SET1_SIG       = 'function set1(uint256 _x)';

async function triggerCall(chainKey) {
  const chain = CHAINS[chainKey];
  if (!chain)              throw new Error(`Unknown chain: ${chainKey}`);
  if (!chain.callContract) throw new Error(`callContract not configured for ${chain.displayName}`);

  const TRANSACTION_API_URL = process.env.TRANSACTION_SERVICE_API_URL;
  const BACKEND_WALLET      = process.env.BACKEND_WALLET;
  if (!TRANSACTION_API_URL || !BACKEND_WALLET) {
    throw new Error('TRANSACTION_SERVICE_API_URL or BACKEND_WALLET env var not set');
  }

  const timestampArg = Date.now();

  await saveCallEvent({
    chainKey,
    chainId:             chain.deployChainId,
    timestampArgument:   timestampArg,
    transactionSentTime: timestampArg,
  });

  let queueId = null;
  try {
    const res = await fetch(`${TRANSACTION_API_URL}/sendTransaction`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chainId:           chain.deployChainId,
        contractAddress:   chain.callContract,
        functionSignature: SET1_SIG,
        backendWallet:     BACKEND_WALLET,
        args:              [String(timestampArg)],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`TX Service: HTTP ${res.status} — ${await res.text()}`);
    const data = await res.json();
    queueId = data.queueId ?? data.queue_id ?? null;
    await updateCallEventQueued(chainKey, timestampArg, queueId);
    logger.info(`[CALL_TRIGGER:${chainKey}] queued ts=${timestampArg} queueId=${queueId}`);
  } catch (err) {
    await updateCallEventFailed(chainKey, timestampArg);
    throw err;
  }

  return { timestampArg, queueId };
}

async function fetchAndSaveActionLogTx(chainKey, timestampArg) {
  const chain = CHAINS[chainKey];
  if (!chain?.callWorkflowName) return false;

  const existing = await getCallEvent(chainKey, timestampArg);
  if (!existing) return false;
  const transactionSentTime = Number(existing.transaction_sent_time);

  const url = `${KWALA_LOG_BASE}/${chain.callWorkflowName}/actionLog?status=success`;
  logger.info(`[ACTION_LOG:${chainKey}] GET ${url} ts=${timestampArg}`);

  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();

    const entries = data?.action_logs ?? (Array.isArray(data) ? data : (data.data ?? data.logs ?? []));
    const latest  = Array.isArray(entries) ? entries[0] : null;

    if (!latest) {
      logger.warn(`[ACTION_LOG:${chainKey}] empty response`);
      return false;
    }

    const createdAt = latest.created_at;
    if (createdAt) {
      const entryTime = new Date(createdAt).getTime();
      if (entryTime < transactionSentTime) {
        logger.warn(`[ACTION_LOG:${chainKey}] stale entry (entry=${createdAt} < sent=${transactionSentTime}) — skipping`);
        return false;
      }
    }

    const hash = latest.txhash ?? latest.tx_hash ?? latest.txHash ?? latest.transaction_id ?? latest.hash ?? null;

    if (!hash) {
      logger.warn(`[ACTION_LOG:${chainKey}] no tx_hash in response`);
      return false;
    }

    const duplicate = await isActionLogHashUsed(hash, chainKey, timestampArg);
    if (duplicate) {
      logger.warn(`[ACTION_LOG:${chainKey}] hash ${hash} already used in another row — stale, skipping`);
      return false;
    }

    await updateCallEventTxHash(chainKey, timestampArg, hash);
    logger.info(`[ACTION_LOG:${chainKey}] tx_hash saved: ${hash} ts=${timestampArg}`);
    return true;
  } catch (err) {
    logger.warn(`[ACTION_LOG:${chainKey}] fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

async function handleWebhookEvent(chainKey, payload) {
  logger.info(`[WEBHOOK:${chainKey}] ${JSON.stringify(payload)}`);

  let rawValue;

  if (payload?.conf) {
    const conf = payload.conf;
    try { rawValue = Number(JSON.parse(conf.event_data)[0]); }
    catch { rawValue = Number(conf.event_data); }
  } else {
    rawValue = Number(payload?.Value ?? payload?.timestamp_argument ?? payload?.event_data);
  }

  if (!rawValue || isNaN(rawValue)) {
    throw new Error(`Cannot parse timestamp from: ${JSON.stringify(payload)}`);
  }

  const eventData         = rawValue;
  const eventReceivedTime = Date.now();

  const existing = await getCallEvent(chainKey, eventData);
  const latencyMs = existing?.transaction_sent_time
    ? eventReceivedTime - Number(existing.transaction_sent_time)
    : null;

  const affected = await updateCallEventReceived(chainKey, eventData, String(eventData), eventReceivedTime, latencyMs);

  if (affected === 0) {
    logger.warn(`[WEBHOOK:${chainKey}] no matching row for ts=${eventData}`);
  } else {
    logger.info(`[WEBHOOK:${chainKey}] DB updated ts=${eventData} latency=${latencyMs}ms`);
    fetchAndSaveActionLogTx(chainKey, eventData).catch(err =>
      logger.warn(`[ACTION_LOG:${chainKey}] background fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    );
  }
}

module.exports = { triggerCall, fetchAndSaveActionLogTx, handleWebhookEvent };
