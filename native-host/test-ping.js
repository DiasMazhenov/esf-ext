const { spawn } = require('node:child_process');
const path = require('node:path');

const bin = path.join(__dirname, 'bin', 'esf-touchid-native-host');
const child = spawn(bin, { stdio: ['pipe', 'pipe', 'inherit'] });
const payload = Buffer.from(JSON.stringify({ command: 'ping' }), 'utf8');
const frame = Buffer.alloc(4 + payload.length);
frame.writeUInt32LE(payload.length, 0);
payload.copy(frame, 4);
child.stdin.end(frame);

const chunks = [];
child.stdout.on('data', (chunk) => chunks.push(chunk));
child.on('close', (code) => {
  if (code !== 0) {
    console.error(`host exited with ${code}`);
    process.exit(code || 1);
  }
  const output = Buffer.concat(chunks);
  const length = output.readUInt32LE(0);
  const message = JSON.parse(output.subarray(4, 4 + length).toString('utf8'));
  console.log(JSON.stringify(message, null, 2));
  process.exit(message.ok && message.message === 'pong' ? 0 : 1);
});
