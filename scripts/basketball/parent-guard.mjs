// Only C-owned child processes import this module. An abruptly lost controller must not leave a server behind.
if (process.connected) process.once('disconnect', () => {
  process.kill(process.pid, 'SIGTERM');
  setTimeout(() => process.exit(1), 10000).unref();
});
