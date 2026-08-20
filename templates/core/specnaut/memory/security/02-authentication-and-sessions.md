# Authentication and sessions

> **Attack surface** — everything between "an anonymous request arrives" and
> "the server believes it knows who is calling": login, signup, password
> reset, MFA, session tokens, self-contained tokens, SSO. The attacker's
> goal is to become someone else, or to stay them after they should have
> been logged out.
>
> **OWASP** A07:2025 Authentication Failures · **ASVS** V6 (Authentication),
> V7 (Session Management), V9 (Self-contained Tokens), V10 (OAuth and OIDC)

## Where to look

- The login, logout, signup, password-reset, and email-verification
  handlers, and anything named `verify`, `confirm`, `otp`, `magic`,
  `refresh`, `impersonate`.
- Password hashing: where the stored value is produced and where it is
  compared.
- Session creation and destruction; cookie flags; token TTLs.
- Token verification: signature check, algorithm pinning, expiry,
  audience, issuer.
- Any comparison of a secret with `==`.

**Search signatures.** `md5`, `sha1`, `sha256(password`, `hashlib`,
`bcrypt`, `argon2`, `scrypt`, `pbkdf2`; `session[`, `req.session`,
`set_cookie`, `httpOnly`, `sameSite`, `secure:`; `jwt.decode`,
`verify(`, `algorithms=`, `alg`, `none`; `Math.random`, `rand()`,
`uuid4` used as a security token; `password ==`, `token ===`.

## Failure modes

### Weak or reversible password storage

Passwords stored plaintext, encrypted (reversible), or hashed with a fast
digest — MD5, SHA-1, SHA-256, or any unsalted hash. Fast digests are
designed for speed, which is exactly what an offline cracker wants.

*Confirm* — the storage function must be a memory-hard or deliberately slow
KDF: Argon2id, scrypt, bcrypt, or PBKDF2 with a high iteration count. A
`sha256(password + salt)` is still confirmed.

*Severity* — CRITICAL. A database leak becomes a credential leak.

### Timing-unsafe secret comparison

A token, HMAC, or reset code compared with `==` / `===`. The comparison
short-circuits on the first differing byte and leaks the correct prefix.

*Confirm* — must use a constant-time comparison
(`crypto.timingSafeEqual`, `hmac.compare_digest`, `hash_equals`).

*Severity* — MEDIUM in most settings, HIGH when the compared value is a
long-lived credential and the endpoint is unthrottled.

### Predictable tokens

Session IDs, reset tokens, API keys, or invite codes generated from a
non-cryptographic source: `Math.random()`, `rand()`, a timestamp, a
sequential counter, or a hash of user data.

*Confirm* — must come from a CSPRNG with at least 128 bits of entropy
(ASVS 7.2.3). A v4 UUID from a CSPRNG-backed implementation qualifies; one
from a seeded PRNG does not.

*Severity* — CRITICAL for session tokens, HIGH for reset tokens.

### Session not invalidated

Logout clears the client cookie but leaves the server session valid; or the
session token is not rotated on privilege change; or disabling an account
leaves its active sessions running.

*Confirm* — logout must destroy server-side state (7.4.1); authentication
and re-authentication must issue a **new** token (7.2.4); account
disable/delete must terminate all active sessions (7.4.2).

*Severity* — HIGH. Not rotating on login is session fixation.

### Missing or bypassable MFA

MFA offered but not enforced on the paths that matter, or the second factor
can be skipped by calling a step directly, or "remember this device" never
expires.

*Confirm* — the server must reject a request that reaches the post-MFA
state without having completed the factor. A flow that trusts a client-sent
`mfa_completed` flag is confirmed.

*Severity* — HIGH.

### Account enumeration

The application reveals whether an account exists — different message,
different status code, or a measurably different response time on login,
signup, or password reset.

*Confirm* — responses must be identical in body, status, and (to a
reasonable degree) timing. Sending the reset mail asynchronously is the
usual fix for the timing half.

*Severity* — MEDIUM alone; it upgrades every credential-stuffing attack.

### No anti-automation on credentials

No rate limit, lockout, or backoff on login, MFA, reset, or token exchange.

*Confirm* — ASVS 6.3.1 requires controls against credential stuffing and
brute force. Per-account *and* per-IP limits; prefer exponential backoff
over hard lockout, which is a denial-of-service lever.

*Severity* — HIGH.

### Weak credential recovery

Reset via knowledge-based questions, a short numeric code with no attempt
limit, a token that does not expire, a token reusable after use, or a reset
link leaked through the `Referer` header.

*Confirm* — single-use, short-TTL, CSPRNG token; invalidate on use and on
password change; never place it in a URL that a third-party page can read.

*Severity* — CRITICAL — password reset is a full account-takeover path.

### Self-contained token verification flaws

A signed token (JWT or similar) accepted without full verification:

- algorithm taken from the token header, allowing `none` or an
  HMAC/RSA confusion attack — **pin the algorithm server-side**;
- signature verified but `exp`, `nbf`, `aud`, or `iss` not checked;
- token decoded (`decode`) rather than verified (`verify`);
- revocation impossible because the token is long-lived and stateless.

*Confirm* — read the verification call and its options. `jwt.decode(...)`
without a key is confirmed and CRITICAL.

*Severity* — CRITICAL for signature/algorithm flaws, HIGH for missing
claim checks.

### Insecure cookie flags

Session cookie missing `HttpOnly` (readable by injected script),
`Secure` (sent over plaintext), or `SameSite` (CSRF exposure).

*Severity* — MEDIUM to HIGH depending on what else is present.

### Default and shipped credentials

A `root`, `admin`, or `sa` account, a seeded password, or a development
bypass (`if env != 'production': login_as_admin()`) reachable in a deployed
build.

*Severity* — CRITICAL.

## When it is NOT a finding

- **The framework's session defaults already do it.** Most mature frameworks set
  secure cookie attributes, rotate on privilege change, and sign or encrypt the
  payload by default. Read the configuration before reporting the absence of
  something the defaults supply — a finding against a default that is already
  correct trains the reader to skim.
- **Rate limiting lives at the edge.** A proxy, gateway, WAF or platform layer
  is a normal home for it. Absence in application code is not absence.
- **The long-lived token is a service credential, not a user session.** Machine
  identities have different lifetimes by design. The question for those is
  rotation and scope, not expiry.
- **Timing differences you did not measure.** Enumeration and timing-oracle
  findings need evidence that the difference is observable, not an argument that
  two branches differ in length.
- **The "plaintext password" is a variable name.** Confirm the value's origin
  before reporting storage of a credential — a field called `password` holding
  an already-hashed value is common.

## Secure patterns

**Password storage.**

```python
# UNSAFE — fast digest, crackable offline
hashlib.md5(password.encode()).hexdigest()

# SAFE — memory-hard KDF, salt and parameters embedded in the output
from argon2 import PasswordHasher
PasswordHasher().hash(password)
```

**Logout destroys server state.**

```python
@app.route('/logout')
@login_required
def logout():
    session.clear()                       # server-side session gone
    response = redirect('/')
    response.delete_cookie('session')     # client copy gone
    return response
```

**Password policy that matches current guidance** — length over
composition. Minimum 8 characters, 15+ recommended; no character-class
rules; allow paste and password managers; verify exactly as received
without truncation or case folding; block known-breached and top-common
passwords; **no forced periodic rotation** — rotate on compromise only.

```python
def validate_password(password: str) -> bool:
    if len(password) < 12:
        return False
    if is_breached(password) or password in TOP_COMMON:
        return False
    return True
```

**Constant-time comparison.**

```php
// UNSAFE — type juggling and early exit
if ($password == $stored_hash) { ... }

// SAFE — constant time, no coercion
if (hash_equals($stored_hash, $candidate)) { ... }
```

## Review checklist

- [ ] Passwords hashed with Argon2id / scrypt / bcrypt — never a fast digest
- [ ] Password minimum 8 characters, 15+ recommended (ASVS 6.2.1); no
      composition rules (6.2.5); paste and managers permitted (6.2.7)
- [ ] Verified exactly as received — no truncation, no case change (6.2.8)
- [ ] Checked against top-3000 common (6.2.4) and a breached set (6.2.12)
- [ ] No forced periodic rotation (6.2.10)
- [ ] Anti-automation against stuffing and brute force (6.3.1)
- [ ] No default `root` / `admin` / `sa` accounts (6.3.2)
- [ ] MFA available and enforced server-side on sensitive operations (6.3.3)
- [ ] Session tokens CSPRNG-generated, 128+ bits entropy (7.2.3)
- [ ] New token issued on authentication and re-authentication (7.2.4)
- [ ] Session unusable after logout or expiry (7.4.1); all sessions
      terminated when an account is disabled (7.4.2)
- [ ] Token verification pins the algorithm and checks `exp`/`aud`/`iss`
- [ ] Cookies carry `HttpOnly`, `Secure`, `SameSite`
- [ ] Reset tokens single-use, short-TTL, invalidated on use
- [ ] Enumeration-resistant responses on login, signup, and reset
- [ ] Secrets compared in constant time
- [ ] Authentication events logged, success and failure (ASVS 16.3.1)
