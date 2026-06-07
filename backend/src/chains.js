const KWALA_API_BASE = 'https://web2-backend.kwala.network/workflow';

const CHAINS = {
  'base-sepolia': {
    displayName:     'Base Sepolia',
    triggerChainId:  80002,
    triggerContract: '0x17B1761C5fe53a07dDf20BA7A49D8b1edD025df4',
    triggerFunction: 'function set1(uint256 _x)',
    deployChainId:   84532,
    workflowName:    'POC_Deploy_TraceId',
    walletAddress:   '0x4b0bf40d9E037AfB23a500bA0Ff4b558015D711F',
  },
  amoy: {
    displayName:      'Polygon Amoy',
    triggerChainId:   80002,
    triggerContract:  '0x17B1761C5fe53a07dDf20BA7A49D8b1edD025df4',
    triggerFunction:  'function set1(uint256 _x)',
    deployChainId:    80002,
    workflowName:     'POC_Deploy_amoy',
    walletAddress:    '0x4b0bf40d9E037AfB23a500bA0Ff4b558015D711F',
    callContract:     '0xCaB85b322B3D39a26469f41A6E617e9E97fEf38f',
    callWorkflowName: 'CallSmartContract_Poc_0x4b0bf40d9E037AfB23a500bA0Ff4b558015D711F',
  },
  fuji: {
    displayName:     'Fuji AVAX',
    triggerChainId:  43113,
    triggerContract: '0x9876d710e5fC31F708BF60512a3BF5F3811Cd72C',
    triggerFunction: 'function set1(uint256 _x)',
    deployChainId:   43113,
    workflowName:    'POC_Deploy_Fuji_avax',
    walletAddress:   '0x4b0bf40d9E037AfB23a500bA0Ff4b558015D711F',
  },
  'op-sepolia': {
    displayName:     'OP Sepolia',
    triggerChainId:  11155420,
    triggerContract: 'PLACEHOLDER_OP_CONTRACT',
    triggerFunction: 'function set1(uint256 _x)',
    deployChainId:   11155420,
    workflowName:    'PLACEHOLDER_OPSepolia_WorkflowName',
    walletAddress:   '0x4b0bf40d9E037AfB23a500bA0Ff4b558015D711F',
  },
  'eth-sepolia': {
    displayName:     'ETH Sepolia',
    triggerChainId:  11155111,
    triggerContract: '0x60eca04c213ec33CECE4bc52db42151D56bB036D',
    triggerFunction: 'function set1(uint256 _x)',
    deployChainId:   11155111,
    workflowName:    'POC_Deploy_Eth_Sepolia',
    walletAddress:   '0x4b0bf40d9E037AfB23a500bA0Ff4b558015D711F',
  },
  bnb: {
    displayName:     'BNB Testnet',
    triggerChainId:  97,
    triggerContract: '0x8856c3fFfFb4F5b2EC1BC50db658fe1aebb180E4',
    triggerFunction: 'function set1(uint256 _x)',
    deployChainId:   97,
    workflowName:    'POC_Deploy_BNB',
    walletAddress:   '0x4b0bf40d9E037AfB23a500bA0Ff4b558015D711F',
  },
  'celo-sepolia': {
    displayName:     'Celo Sepolia',
    triggerChainId:  44787,
    triggerContract: 'PLACEHOLDER_CELO_CONTRACT',
    triggerFunction: 'function set1(uint256 _x)',
    deployChainId:   44787,
    workflowName:    'PLACEHOLDER_CeloSepolia_WorkflowName',
    walletAddress:   '0x4b0bf40d9E037AfB23a500bA0Ff4b558015D711F',
  },
};

function getPollUrl(chainKey) {
  const chain = CHAINS[chainKey];
  if (!chain) throw new Error(`Unknown chain: ${chainKey}`);
  return `${KWALA_API_BASE}/${chain.workflowName}_${chain.walletAddress}/actionLog?status=success`;
}

module.exports = { CHAINS, getPollUrl };
