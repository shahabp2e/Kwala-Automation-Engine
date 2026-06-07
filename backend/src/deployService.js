require('dotenv/config');
const { ethers }               = require('ethers');
const fs                       = require('fs/promises');
const { mkdirSync, existsSync } = require('fs');
const path                     = require('path');
const { logEmitter }           = require('./logEmitter');
const { workflowState }        = require('./workflowState');
const { processYaml }          = require('./yamlProcessor');
const { createDeployment, updateDeployment, saveLog } = require('./db');
const logger                   = require('./logger');

const YAML_DIR = process.env.YAML_DIR
  ? path.resolve(process.env.YAML_DIR)
  : path.join(__dirname, '..', '..', 'data', 'yaml_workflows');

if (!existsSync(YAML_DIR)) mkdirSync(YAML_DIR, { recursive: true });

const VERIFY_URL    = process.env.VERIFY_URL    || 'https://kwala-test.kalp.network/workflow/verify';
const RECHARGE_BASE = process.env.RECHARGE_BASE || 'https://kwala-test.kalp.network/user/recharge';

function getEnvConfig() {
  const rpcUrl          = process.env.RPC_URL;
  const chainId         = parseInt(process.env.CHAIN_ID || '0', 10);
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const gasPrice        = process.env.GAS_PRICE              || '1000000000';
  const gasLimit        = process.env.GAS_LIMIT              || '3000000';
  const statusApiBase   = process.env.STATUS_API_BASE        || '';
  const statusCheckInterval = parseInt(process.env.STATUS_CHECK_INTERVAL || '5000', 10);
  const maxStatusChecks     = parseInt(process.env.MAX_STATUS_CHECKS     || '60',   10);
  const privateKey      = process.env.DEPLOYER_PRIVATE_KEY;

  if (!rpcUrl)          throw new Error('RPC_URL env var is required');
  if (!chainId)         throw new Error('CHAIN_ID env var is required');
  if (!contractAddress) throw new Error('CONTRACT_ADDRESS env var is required');
  if (!privateKey)      throw new Error('DEPLOYER_PRIVATE_KEY env var is required');

  return { rpcUrl, chainId, contractAddress, gasPrice, gasLimit, statusApiBase, statusCheckInterval, maxStatusChecks, privateKey };
}

async function getWorkflowFiles() {
  const files = await fs.readdir(YAML_DIR);
  return files
    .filter(f => {
      const l = f.toLowerCase();
      return (l.endsWith('.yaml') || l.endsWith('.yml'))
        && !l.includes('template')
        && !l.includes('readme')
        && !l.endsWith('.bak');
    })
    .sort();
}

async function getBalance(rpcUrl, address, timeoutMs = 5000) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res  = await fetch(rpcUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBalance', params: [address, 'latest'], id: 1 }),
      signal:  ctrl.signal,
    });
    const data = await res.json();
    return parseFloat(ethers.formatEther(BigInt(data.result || '0x0')));
  } finally {
    clearTimeout(timer);
  }
}

async function rechargeBalance(rpcUrl, address) {
  try {
    const url = `${RECHARGE_BASE}/${address.toLowerCase()}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) throw new Error(`Recharge API returned HTTP ${res.status}`);
    await new Promise(r => setTimeout(r, 2000));
    const balance = await getBalance(rpcUrl, address);
    return { success: true, balance };
  } catch (err) {
    return { success: false, balance: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkAndRecharge(rpcUrl, address, minBalance = 0.01) {
  const balance = await getBalance(rpcUrl, address);
  if (balance < minBalance) {
    const result = await rechargeBalance(rpcUrl, address);
    return { ...result, recharged: true };
  }
  return { success: true, balance, recharged: false };
}

async function getWalletInfo() {
  const { rpcUrl, privateKey } = getEnvConfig();
  const wallet = new ethers.Wallet(privateKey);
  try {
    const balance = await getBalance(rpcUrl, wallet.address);
    return { address: wallet.address, balance: balance.toFixed(4) };
  } catch {
    return { address: wallet.address, balance: '—' };
  }
}

async function deployWorkflow(filename) {
  const {
    rpcUrl, chainId, contractAddress, gasPrice, gasLimit,
    statusApiBase, statusCheckInterval, maxStatusChecks, privateKey,
  } = getEnvConfig();

  const wallet   = new ethers.Wallet(privateKey);
  const rawYaml  = await fs.readFile(path.join(YAML_DIR, filename), 'utf-8');
  const { yaml: processedYaml, name: workflowName } = processYaml(rawYaml, wallet.address);

  const startedAt = Date.now();
  let deploymentId = -1;

  try { deploymentId = await createDeployment(filename, workflowName); }
  catch (err) { logger.error(`Failed to create deployment record: ${err instanceof Error ? err.message : String(err)}`); }

  const emit = async (level, message) => {
    const entry = { timestamp: new Date().toISOString(), level, message, workflow: filename, deploymentId };
    logEmitter.emit('log', entry);
    if (deploymentId > 0) {
      try { await saveLog(deploymentId, level, message, filename); } catch { /* non-fatal */ }
    }
  };

  const setState = async (status, txHash, error) => {
    workflowState.set(filename, { filename, name: workflowName, status, txHash, error, deploymentId, startedAt });
    if (deploymentId > 0) {
      const isDone = status === 'deployed' || status === 'failed';
      try {
        await updateDeployment(deploymentId, {
          status, txHash, error, workflowName,
          completedAt: isDone ? new Date() : undefined,
          durationMs:  isDone ? Date.now() - startedAt : undefined,
        });
      } catch (dbErr) {
        const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        logger.warn(`DB update failed [id=${deploymentId} → ${status}]: ${msg}`);
        logEmitter.emit('log', { timestamp: new Date().toISOString(), level: 'warning', message: `   [DB] Update failed: ${msg}`, workflow: filename, deploymentId });
      }
    }
  };

  await setState('verifying');
  await emit('info', `── Starting: ${filename}`);
  await emit('info', `   Workflow name: ${workflowName}`);

  // ── Phase 0: Balance check & auto-recharge ──────────────────────────────────
  await emit('info', '   Checking wallet balance...');
  try {
    const { success, balance, recharged, error } = await checkAndRecharge(rpcUrl, wallet.address, 0.01);
    if (!success) {
      await emit('warning', `   Balance check failed: ${error} — proceeding anyway`);
    } else if (recharged) {
      await emit('success', `   Balance was low — recharged ✓  New balance: ${balance.toFixed(4)} KWALA`);
    } else {
      await emit('info', `   Balance: ${balance.toFixed(4)} KWALA ✓`);
    }
  } catch (err) {
    await emit('warning', `   Balance check error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Phase 1: Verify ─────────────────────────────────────────────────────────
  await emit('info', '   Verifying YAML...');
  try {
    const vRes = await fetch(VERIFY_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yaml: processedYaml, user_address: wallet.address }),
    });
    const rawText = await vRes.text();
    let vData;
    try { vData = JSON.parse(rawText); }
    catch { throw new Error(`Verify API returned non-JSON (HTTP ${vRes.status}): ${rawText.slice(0, 200)}`); }
    if (!vData.syntax_check || !vData.schema_validation) {
      const detail = vData.error || vData.message || `syntax=${vData.syntax_check}, schema=${vData.schema_validation}`;
      throw new Error(detail);
    }
    await emit('success', '   Verification passed ✓');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setState('failed', undefined, msg);
    await emit('error', `   Verification failed: ${msg}`);
    return;
  }

  // ── Phase 2: Get nonce ──────────────────────────────────────────────────────
  await setState('deploying');
  let nonce;
  try {
    const nRes  = await fetch(rpcUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getTransactionCount', params: [wallet.address, 'pending'], id: Date.now() }),
    });
    const nData = await nRes.json();
    nonce = nData.result;
    await emit('info', `   Nonce: ${parseInt(nonce, 16)}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setState('failed', undefined, msg);
    await emit('error', `   Nonce error: ${msg}`);
    return;
  }

  // ── Phase 3: Sign & Send ────────────────────────────────────────────────────
  let txHash;
  try {
    const iface = new ethers.Interface(['function deployWorkflow(string calldata yaml, string calldata version)']);
    const data  = iface.encodeFunctionData('deployWorkflow', [processedYaml, 'v2']);
    const tx    = {
      to: contractAddress, nonce: parseInt(nonce, 16), data,
      chainId, gasPrice: BigInt(gasPrice), gasLimit: BigInt(gasLimit),
      value: 0n, type: 0,
    };
    await emit('info', '   Signing & sending transaction...');
    const signedTx = await wallet.signTransaction(tx);
    const sRes     = await fetch(rpcUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_sendRawTransaction', params: [signedTx], id: Date.now() }),
    });
    const sData = await sRes.json();
    if (sData.error) throw new Error(sData.error.message);
    const r = sData.result;
    txHash = typeof r === 'string' ? r
           : (r && typeof r === 'object' && typeof r.txHash === 'string') ? r.txHash
           : JSON.stringify(r);
    await emit('success', `   TxHash: ${txHash}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setState('failed', undefined, msg);
    await emit('error', `   Transaction failed: ${msg}`);
    return;
  }

  // ── Phase 4: Poll status ────────────────────────────────────────────────────
  await emit('info', '   Polling for deployment status...');
  let finalStatus = 'UNKNOWN';

  for (let i = 0; i < maxStatusChecks; i++) {
    await new Promise(r => setTimeout(r, statusCheckInterval));
    try {
      const stRes  = await fetch(`${statusApiBase}/${workflowName}/status`);
      const stData = await stRes.json();
      finalStatus  = stData.status || 'UNKNOWN';
      if (i % 3 === 0) await emit('info', `   Status: ${finalStatus}`);
      if (finalStatus === 'CLAIMED' || finalStatus === 'WORKFLOW_DEPLOYED') {
        await setState('deployed', txHash);
        await emit('success', `   Deployed successfully! ✓ (${finalStatus})`);
        return;
      }
      if (finalStatus === 'DEPLOYMENT_FAILED' || finalStatus === 'INITIALISATION_FAILED' || finalStatus === 'WORKFLOW_FAILED') {
        throw new Error(`Backend: ${finalStatus}`);
      }
    } catch (pollErr) {
      const msg = pollErr instanceof Error ? pollErr.message : String(pollErr);
      if (msg.startsWith('Backend:')) {
        await setState('failed', txHash, msg);
        await emit('error', `   ${msg}`);
        return;
      }
      await emit('warning', `   Status check error: ${msg}`);
    }
  }

  await setState('failed', txHash, `Timeout — final: ${finalStatus}`);
  await emit('error', `   Timeout after ${maxStatusChecks} checks. Final status: ${finalStatus}`);
}

module.exports = { YAML_DIR, getWorkflowFiles, getWalletInfo, deployWorkflow };
