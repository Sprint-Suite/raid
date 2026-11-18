// Raid sits behind Apache on the same box, so it must accept connections on
// loopback only. Probes the running e2e server on the same port via loopback
// and via this machine's own non-loopback IPv4 address.
const { test, expect } = require('@playwright/test');
const net = require('net');
const os = require('os');

const PORT = 3003;

function lanAddress() {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return null;
}

// Resolves "connected", the socket error code, or "timeout".
function probe(host) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port: PORT });
    socket.setTimeout(2000);
    socket.once('connect', () => { socket.destroy(); resolve('connected'); });
    socket.once('error', (e) => resolve(e.code));
    socket.once('timeout', () => { socket.destroy(); resolve('timeout'); });
  });
}

test('the server accepts loopback connections', async () => {
  expect(await probe('127.0.0.1')).toBe('connected');
});

test('the server refuses connections on a non-loopback address', async () => {
  const lan = lanAddress();
  test.skip(!lan, 'no non-loopback IPv4 interface on this machine');
  // ECONNREFUSED proves nothing listens there; a timeout would only prove a filter.
  expect(await probe(lan)).toBe('ECONNREFUSED');
});
