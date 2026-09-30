const SENSITIVE_KEYS = /(password|secret|token|credential|clipboard)/i;

function redact(value, seen = new WeakSet()) {
  if (typeof value === 'string') {
    return value
      .replace(/(password|secret|token|credential)\s*[=:]\s*([^\s,;]+)/gi, '$1=[REDACTED]')
      .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1[REDACTED]');
  }
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  if (Array.isArray(value)) return value.map(item => redact(item, seen));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEYS.test(key) ? '[REDACTED]' : redact(item, seen)]));
}

module.exports = { redact };
