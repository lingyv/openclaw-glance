import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { startDaemon } from '../src/daemon/start-daemon.js';

test('daemon rejects duplicate start with same token key', async () => {
  const lockDir = await mkdtemp(path.join(os.tmpdir(), 'daemon-lock-'));

  const fakeCreateRuntime = ({ dispatcher }) => {
    return {
      start: async () => {},
      stop: async () => {},
      emitTriggered: async (event) => dispatcher.onTriggered(event)
    };
  };

  const first = await startDaemon({
    config: {
      baseWsUrl: 'ws://127.0.0.1:10090',
      token: 'token-x',
      lockDir,
      lockKey: 'same-key'
    },
    createRuntime: fakeCreateRuntime
  });

  try {
    await assert.rejects(
      startDaemon({
        config: {
          baseWsUrl: 'ws://127.0.0.1:10090',
          token: 'token-x',
          lockDir,
          lockKey: 'same-key'
        },
        createRuntime: fakeCreateRuntime
      }),
      (err) => {
        assert.equal(err?.code, 'E_SINGLE_ACTIVE_CONFLICT');
        return true;
      }
    );
  } finally {
    await first.stop();
  }
});

test('daemon can restart after previous instance stops', async () => {
  const lockDir = await mkdtemp(path.join(os.tmpdir(), 'daemon-lock-'));
  const fakeCreateRuntime = () => ({
    start: async () => {},
    stop: async () => {}
  });

  const first = await startDaemon({
    config: {
      baseWsUrl: 'ws://127.0.0.1:10091',
      token: 'token-y',
      lockDir,
      lockKey: 'restart-key'
    },
    createRuntime: fakeCreateRuntime
  });
  await first.stop();

  const second = await startDaemon({
    config: {
      baseWsUrl: 'ws://127.0.0.1:10091',
      token: 'token-y',
      lockDir,
      lockKey: 'restart-key'
    },
    createRuntime: fakeCreateRuntime
  });
  await second.stop();
  assert.ok(true);
});
