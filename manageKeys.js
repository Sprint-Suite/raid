#!/usr/bin/env node
// manageKeys.js — CLI for adding/removing/listing access keys.
//
// Usage:
//   node manageKeys.js generate <name>
//   node manageKeys.js list
//   node manageKeys.js remove <name>

const {
  AccessKeyError,
  createAccessKey,
  getKeysFilePath,
  listAccessKeys,
  removeAccessKey
} = require('./lib/accessKeys');

const KEYS_FILE = getKeysFilePath(__dirname);

const [,, command, nameArg] = process.argv;

if (!command || !['generate', 'list', 'remove'].includes(command)) {
  console.error('Usage:');
  console.error('  node manageKeys.js generate <name>');
  console.error('  node manageKeys.js list');
  console.error('  node manageKeys.js remove <name>');
  process.exit(1);
}

function fail(err) {
  if (err instanceof AccessKeyError) {
    console.error(err.message);
  } else {
    console.error(err.message || err);
  }
  process.exit(1);
}

try {
  switch (command) {
    case 'generate': {
      if (!nameArg) {
        console.error('Please supply a name: node manageKeys.js generate <name>');
        process.exit(1);
      }
      const { name, value } = createAccessKey(KEYS_FILE, nameArg);
      console.log(`Generated key for "${name}":`);
      console.log(value);
      console.log('');
      console.log('Save this value now — it will not be shown again.');
      break;
    }

    case 'list': {
      const keys = listAccessKeys(KEYS_FILE);
      if (keys.length === 0) {
        console.log('No keys found. Generate one with: node manageKeys.js generate <name>');
      } else {
        console.log('Existing keys:');
        for (const { name, active, createdAt } of keys) {
          const tag = active ? 'active' : 'suspended';
          const when = createdAt ? ` · created ${createdAt}` : '';
          console.log(`  ${name} (${tag})${when}`);
        }
      }
      break;
    }

    case 'remove': {
      if (!nameArg) {
        console.error('Please supply a name: node manageKeys.js remove <name>');
        process.exit(1);
      }
      const { name } = removeAccessKey(KEYS_FILE, nameArg);
      console.log(`Removed key for "${name}".`);
      break;
    }
  }
} catch (err) {
  fail(err);
}
