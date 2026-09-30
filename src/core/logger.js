const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { redact } = require('./redaction');

class StructuredLogger {
  constructor(logDirectory) {
    this.logDirectory = logDirectory;
    fs.mkdirSync(logDirectory, { recursive: true, mode: 0o700 });
    this.filePath = path.join(logDirectory, `eas-rpa-${new Date().toISOString().slice(0, 10)}.jsonl`);
  }
  createRunId() { return `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`; }
  write(level, event, context = {}) {
    const entry = redact({ timestamp: new Date().toISOString(), level, event, ...context });
    fs.appendFileSync(this.filePath, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
    return entry;
  }
}

module.exports = { StructuredLogger };
