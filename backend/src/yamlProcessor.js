function generateRandomName() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let rand = '';
  for (let i = 0; i < 12; i++) rand += chars.charAt(Math.floor(Math.random() * chars.length));
  return `workflow-${rand}`;
}

function processYaml(raw, walletAddress) {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = now + 30 * 60;
  let yaml = raw;

  const nameMatch = yaml.match(/^Name:\s*(.+)$/m);
  let name = nameMatch ? nameMatch[1].trim() : null;
  if (!name || name === 'DYNAMIC_NAME_PLACEHOLDER') {
    name = generateRandomName();
    yaml = yaml.replace(/^Name:\s*.+$/m, `Name: ${name}`);
  }

  if (/^\s*ExpiresIn:\s*.+$/m.test(yaml)) {
    yaml = yaml.replace(/^(\s*)ExpiresIn:\s*.+$/m, `$1ExpiresIn: ${expiresIn}`);
  } else {
    yaml = yaml.replace(/^(\s*ExecuteAfter:.+)$/m, `$1\n  ExpiresIn: ${expiresIn}`);
  }

  yaml = yaml.replace(
    /^(\s*ExecuteAfter:\s*)DYNAMIC_TIMESTAMP_PLACEHOLDER\s*$/m,
    `$1${now}`
  );

  yaml = yaml.replace(/^(\s*SmartWallet:\s*)NA\s*$/gm, `$1${walletAddress}`);

  return { yaml, name };
}

module.exports = { processYaml };
