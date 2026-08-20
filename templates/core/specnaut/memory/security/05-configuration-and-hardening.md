# Configuration and hardening

> **Attack surface** — everything the application is *set to do* rather than
> coded to do: framework settings, environment flags, response headers,
> cookie attributes, cloud permissions, exposed surface. Misconfiguration
> rose to #2 in the 2025 Top 10 because it scales — one wrong default is
> deployed to every environment at once, and nothing in the code review
> shows it.
>
> **OWASP** A02:2025 Security Misconfiguration · **ASVS** V13
> (Configuration), V3 (Web Frontend Security), V4 (API and Web Service)

## Where to look

- Framework settings modules and every environment overlay.
- `.env` files and their committed examples — the example is often the
  production shape with one value changed.
- Container images, orchestration manifests, and infrastructure-as-code.
- Web-server and reverse-proxy configuration.
- Response headers, on a real response rather than in the code that
  intends to set them.
- Anything conditional on an environment name.

**Search signatures.** `DEBUG`, `development`, `TRACE`, `verbose`,
`stacktrace`; `Content-Security-Policy`, `Strict-Transport-Security`,
`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`;
`sameSite`, `httpOnly`, `secure`; `0.0.0.0`, `allow_all`, `public-read`,
`"*"` in a policy document; `if env == 'production'` and its negations;
default ports and default admin paths.

## Failure modes

### Debug mode or verbose errors in a deployed build

Debug enabled, an interactive traceback page, a profiler endpoint, or
stack traces returned to the client. Reveals paths, versions, framework
internals, sometimes environment variables — and some debug consoles
execute code.

*Confirm* — check the deployed configuration, not the default in the source.

*Severity* — HIGH; CRITICAL if the debug surface can evaluate code.

### Default credentials and default surface

Shipped accounts, sample applications, admin consoles on a default path,
management ports bound to all interfaces, unused services enabled.

*Confirm* — ASVS 6.3.2 [L1] requires default accounts to be absent or
disabled. Minimize the platform: remove features and frameworks you do not
use (A02 mitigation 2).

*Severity* — CRITICAL for reachable default credentials.

### Missing security headers

- **`Content-Security-Policy`** — the meaningful defence-in-depth layer
  against XSS. Watch for a policy so permissive it does nothing:
  `unsafe-inline`, `unsafe-eval`, or a wildcard `script-src`.
- **`Strict-Transport-Security`** — without it the first request can be
  downgraded.
- **`X-Content-Type-Options: nosniff`** — stops MIME sniffing turning an
  upload into script.
- **`X-Frame-Options`** / `frame-ancestors` — clickjacking.
- **`Referrer-Policy`** — stops URLs (and anything in them) leaking to
  third parties.

*Severity* — MEDIUM individually; HIGH when the application also has an
injection sink.

### Cross-site request forgery

A state-changing endpoint that authenticates purely from an ambient
credential — a cookie — with nothing binding the request to the
application's own origin.

*Confirm* — one of: an anti-CSRF token validated server-side, `SameSite`
cookies (`Lax` at minimum, `Strict` for sensitive flows), or a scheme where
the credential is not ambient (an `Authorization` header). Also check that
the endpoint rejects unexpected content types — a form-encoded POST is
cross-origin-sendable in ways a JSON one is not.

*Severity* — HIGH for account-affecting operations.

### Overly permissive cloud and storage permissions

Object storage readable or writable by anyone, an IAM role with wildcard
actions or resources, a database reachable from the public internet, a
security group open to `0.0.0.0/0` on an administrative port.

*Confirm* — least privilege: enumerate what the principal actually needs.
Wildcards in a policy are worth flagging even when the blast radius is
currently small.

*Severity* — CRITICAL for public write or a wildcard admin role.

### Environment drift

Staging and production diverge, so hardening verified in one is absent in
the other; or a control is applied by a manual step no one repeats.

*Confirm* — A02 mitigation 1 asks for an automated, repeatable hardening
process across environments, and mitigation 6 for automated verification.
Configuration that exists only as an operator's habit is a finding.

*Severity* — MEDIUM to HIGH.

### Unnecessary exposure

Source maps in production, `.git/` served, an OpenAPI document exposing
internal routes, a health endpoint returning versions and dependency
state, verbose `Server` and `X-Powered-By` headers, directory listing.

*Severity* — LOW to HIGH depending on what is revealed.

### Dangerous environment guards

Security controls disabled by a condition that can be true where it should
not be — `if not PRODUCTION: skip_auth()`, a bypass keyed on a header, a
feature flag defaulting to open, a test hook left routable.

*Confirm* — trace how the condition is evaluated in a deployed build. A
control that depends on an environment variable being set correctly fails
open when it is unset.

*Severity* — CRITICAL when it disables authentication or authorization.

### Client-side storage of sensitive data

Tokens or personal data in `localStorage`, `sessionStorage`, or a
non-`HttpOnly` cookie — readable by any injected script — and not cleared
on logout (ASVS 14.3.1 requires clearing authenticated data from client
storage on session termination).

*Severity* — MEDIUM to HIGH.

### Missing resource and request limits

No body-size cap, no timeout, no connection limit, no pagination ceiling.
Cheap denial of service, and often the enabler for a memory-exhaustion bug.

*Severity* — MEDIUM.

## When it is NOT a finding

- **Development configuration, in a development-only file.** Debug flags,
  permissive origins and verbose errors are correct there. Confirm the file is
  loaded in production before reporting it.
- **The header is set at the edge.** Security headers are commonly applied by a
  CDN, proxy or platform. Absence in application code proves nothing about the
  response a client receives.
- **A permissive setting that a narrower layer overrides.** Configuration
  usually composes; the effective value is what matters, and it is rarely the
  first one you find.
- **Broad cloud permissions on a resource with nothing sensitive.** Least
  privilege is right, but a finding needs to name what the excess actually
  reaches.
- **The disabled protection is unreachable.** A setting guarding a feature this
  deployment does not run is latent. Say which it is.

## Secure patterns

**Deployed configuration is hardened by default.**

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

**Fail closed on a missing setting.**

```python
# UNSAFE — an unset variable silently disables the control
ENFORCE_MFA = os.getenv("ENFORCE_MFA") == "true"

# SAFE — unset means the strict value; misconfiguration is loud
ENFORCE_MFA = os.getenv("ENFORCE_MFA", "true") != "false"
```

**Verify headers on a response, not in the code.** A header set by
middleware that never runs on the error path is not set.

## Review checklist

- [ ] Debug, tracebacks, profilers, and debug consoles off in deployed
      builds
- [ ] No default accounts or shipped credentials (ASVS 6.3.2)
- [ ] Unused features, services, ports, and sample apps removed
- [ ] `Content-Security-Policy` present and not neutered by `unsafe-inline`
      or a wildcard `script-src`
- [ ] `Strict-Transport-Security`, `X-Content-Type-Options`,
      `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy` set
- [ ] State-changing endpoints protected against CSRF (token or `SameSite`)
- [ ] Cookies: `HttpOnly`, `Secure`, `SameSite`
- [ ] Cloud permissions least-privilege; no wildcard actions or resources;
      no public-write storage
- [ ] Hardening is automated and identical across environments, and
      verified automatically
- [ ] No source maps, `.git/`, directory listing, or version-disclosing
      headers exposed
- [ ] No environment-conditional bypass of an authentication or
      authorization control
- [ ] Security-relevant settings fail closed when unset
- [ ] Authenticated data cleared from client storage on logout (14.3.1)
- [ ] Body size, timeout, connection, and pagination limits enforced
