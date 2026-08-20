# Cryptography and secrets

> **Attack surface** — the algorithms protecting data, the keys those
> algorithms depend on, and the credentials that reach the codebase. Two
> distinct failure families share this file because they share a root cause:
> a secret ends up somewhere it can be read, or a construction ends up
> weaker than it appears.
>
> **OWASP** A04:2025 Cryptographic Failures · **ASVS** V11 (Cryptography),
> V12 (Secure Communication)

## Where to look

- Every call into a crypto library: cipher construction, mode selection,
  hashing, signing, key derivation, random number generation.
- TLS configuration: versions, cipher suites, certificate validation,
  anything that disables verification.
- Environment files, CI configuration, container manifests, IaC, test
  fixtures, seed data, committed archives.
- Git history — a rotated secret removed at `HEAD` is still in the history.

**Search signatures.** `MD5`, `SHA1`, `DES`, `RC4`, `ECB`, `PKCS1v15`,
`NULL` cipher; `Math.random`, `rand()`, `mt_rand`, `Random()` used for a
secret; `verify=False`, `rejectUnauthorized: false`, `InsecureSkipVerify`,
`ALLOW_ALL_HOSTNAME_VERIFIER`, `NODE_TLS_REJECT_UNAUTHORIZED=0`;
`-----BEGIN`, `api_key`, `apikey`, `secret`, `token`, `passwd`,
`AKIA`, `sk_live`, `ghp_`, `xoxb-`; `http://` on anything that carries data.

## Handling rule — never print a secret

When a credential is found, report **its location and kind only**. Never
echo the value, not truncated, not partially masked, not "for
confirmation" — a security report is copied, pasted, and pasted again.

Never run a command whose output dumps a secret store wholesale. Prefer
existence and length checks:

```bash
# Confirms presence without revealing the value
test -n "${MY_TOKEN:-}" && echo "MY_TOKEN: set (${#MY_TOKEN} chars)"
```

## Failure modes

### Secret committed to the repository

A key, token, password, connection string, or private key in tracked
source, a `.env`, a fixture, a notebook, a lockfile, or the git history.

*Confirm* — decide whether it is **live**. A live production credential is
CRITICAL and needs rotation, not deletion; a random test fixture is INFO.
Read the surrounding context, not just the pattern.

*Remediation, in order* — (1) rotate the credential at its issuer, (2)
remove it from history, (3) move it to a secret manager, (4) add a
pre-commit scan. Removing at `HEAD` alone fixes nothing.

*Severity* — CRITICAL if live, INFO if demonstrably a placeholder.

### Weak or obsolete algorithms

MD5 or SHA-1 for signatures or integrity; DES, 3DES, RC4; RSA keys below
2048 bits; ECB mode; PKCS#1 v1.5 padding. ASVS 11.3.1 [L1] names ECB and
PKCS#1 v1.5 explicitly; 11.3.2 [L1] requires approved ciphers and modes
such as AES-GCM; 11.4.1 [L1] requires approved hash functions for
signatures, HMAC, KDFs, and random-bit generation.

*Note* — MD5/SHA-1 for a non-security purpose (a cache key, a shard
selector) is not a finding. Check what the digest is *for*.

*Severity* — HIGH when protecting anything; see
`02-authentication-and-sessions.md` for password hashing specifically.

### Unauthenticated encryption

Encryption without integrity — CBC or CTR with no MAC. The ciphertext can
be modified undetectably, which enables padding-oracle and bit-flipping
attacks.

*Confirm* — must be an AEAD mode (GCM, CCM, ChaCha20-Poly1305) or
encrypt-then-MAC done correctly.

*Severity* — HIGH.

### Insufficient entropy

Keys, IVs, nonces, salts, or tokens from a non-cryptographic RNG; a reused
nonce with GCM (catastrophic — it breaks confidentiality *and* authenticity
for that key); a hardcoded IV or salt.

*Confirm* — must be a CSPRNG. Nonces must be unique per key.

*Severity* — CRITICAL for key material and GCM nonce reuse.

### Poor key management

Keys hardcoded, derived from a low-entropy passphrase, checked into
configuration, shared across environments, never rotated, or with no
mechanism to rotate them.

*Confirm* — keys should come from a managed secret store or KMS, be
distinct per environment, and be rotatable without a code change. "We could
rotate it but every service would break" is a finding.

*Severity* — HIGH.

### Cleartext transmission

Data over HTTP, plain SMTP, FTP, or an unencrypted internal hop. "It is on
the private network" is not a control.

*Confirm* — TLS 1.2 or 1.3 only (ASVS 12.1.1); TLS on all client-to-service
connectivity with no insecure fallback (12.2.1); publicly trusted
certificates on external-facing services (12.2.2).

*Severity* — HIGH; CRITICAL if credentials or personal data are in flight.

### Certificate validation disabled

`verify=False`, `rejectUnauthorized: false`, `InsecureSkipVerify`, a
trust-all hostname verifier, or a custom trust manager that accepts
everything. Almost always added to unblock a local environment and then
shipped.

*Confirm* — check whether it is behind an environment guard, and whether
that guard can be true in a deployed build.

*Severity* — HIGH; the TLS connection is decorative without it.

### Home-grown cryptography

A custom cipher, a custom token format, XOR "encryption", or encoding
mistaken for encryption (Base64 is not encryption; nor is ROT13, nor a
reversible obfuscation).

*Severity* — HIGH.

### Secrets in the wrong places

A credential in a URL or query string (ASVS 14.2.1 forbids sensitive data
in URLs — they land in logs, proxies, browser history, and `Referer`
headers), in a log line, in an error message, in a client-side bundle, in a
build argument that persists in an image layer, or in a system prompt.

*Severity* — HIGH.

### Sensitive responses cached

Responses containing personal or authenticated data served without
`Cache-Control: no-store`, so they persist in shared caches and on disk.

*Severity* — MEDIUM.

## When it is NOT a finding

- **The "hardcoded secret" is a test fixture, an example, or a public key.**
  Confirm what the value actually is. **Do not quote it either way** — report
  its location and kind only, whatever your conclusion.
- **Weak primitives outside a security boundary.** A fast non-cryptographic hash
  used for cache keys, shard selection, or change detection is the correct tool.
  The finding requires the value to be protecting something.
- **The algorithm choice is the platform's.** A managed service, a KMS, or a
  framework's own token format is not yours to second-guess without a specific
  advisory.
- **The key is in the environment, which is where it belongs.** Reading a
  credential from an environment variable is the recommended pattern, not a
  leak. The finding would be logging it, committing it, or shipping it to a
  client.
- **Deterministic encryption or a fixed nonce may be required** by a searchable
  or deduplicating scheme. It is still worth reporting, but as a documented
  trade-off, not as a defect the author overlooked.

## Secure patterns

**Authenticated encryption, not raw block modes.**

```python
# UNSAFE — ECB leaks structure and provides no integrity
cipher = AES.new(key, AES.MODE_ECB)

# SAFE — AEAD: confidentiality and integrity together
from cryptography.fernet import Fernet
cipher = Fernet(key)
```

**Config: no secrets, no debug, in the deployed build.**

```yaml
# UNSAFE
DEBUG=True
SECRET_KEY="development-key"

# SAFE
DEBUG=False
SECRET_KEY="${SECRET_FROM_MANAGER}"
ALLOWED_HOSTS=["app.example.com"]
SECURE_SSL_REDIRECT=True
SESSION_COOKIE_SECURE=True
CSRF_COOKIE_SECURE=True
```

**Classify before you encrypt.** Decide what is sensitive, then apply
controls. The cheapest control is not storing it: data you never collected
cannot leak.

## Review checklist

- [ ] No credential in tracked source, fixtures, CI config, or git history
- [ ] Secrets loaded from environment or a managed secret store, never
      literal
- [ ] Any found live credential is **rotated**, not just deleted
- [ ] No ECB mode, no PKCS#1 v1.5 padding (ASVS 11.3.1)
- [ ] Approved ciphers and modes only, e.g. AES-GCM (11.3.2)
- [ ] Approved hash functions for signatures, HMAC, KDF, RBG (11.4.1)
- [ ] Encryption is authenticated (AEAD or encrypt-then-MAC)
- [ ] Keys, IVs, nonces, salts from a CSPRNG; GCM nonces never reused
- [ ] Keys distinct per environment and rotatable without a code change
- [ ] TLS 1.2+ only, no insecure fallback (12.1.1, 12.2.1)
- [ ] Publicly trusted certificates on external services (12.2.2)
- [ ] Certificate validation enabled everywhere in deployed builds
- [ ] No sensitive data in URLs or query strings (14.2.1)
- [ ] No secrets in logs, error messages, client bundles, or image layers
- [ ] No custom cryptographic constructions
- [ ] Sensitive responses marked `no-store`
