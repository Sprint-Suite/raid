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

function connects(host) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port: PORT });
    socket.setTimeout(2000);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });
}

test('the server accepts loopback connections', async () => {
  expect(await connects('127.0.0.1')).toBe(true);
});

test('the server refuses connections on a non-loopback address', async () => {
  const lan = lanAddress();
  test.skip(!lan, 'no non-loopback IPv4 interface on this machine');
  expect(await connects(lan)).toBe(false);
});
