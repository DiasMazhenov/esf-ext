const { spawn } = require('node:child_process');
const path = require('node:path');

const command = process.argv[2] || 'ping';
const payloadArg = process.argv[3] || '{}';
const payload = { ...JSON.parse(payloadArg), command };

const bin = path.join(__dirname, 'bin', 'esf-touchid-native-host');
const child = spawn(bin, { stdio: ['pipe', 'pipe', 'inherit'] });
const message = Buffer.from(JSON.stringify(payload), 'utf8');
const frame = Buffer.alloc(4 + message.length);
frame.writeUInt32LE(message.length, 0);
message.copy(frame, 4);
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
  const response = JSON.parse(output.subarray(4, 4 + length).toString('utf8'));
  console.log(JSON.stringify(response, null, 2));
  process.exit(response.ok ? 0 : 1);
});
