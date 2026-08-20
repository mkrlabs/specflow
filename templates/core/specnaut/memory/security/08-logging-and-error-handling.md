# Logging and error handling

> **Attack surface** — two failures that share a file because they share a
> moment: what the system does when something goes wrong. Bad error
> handling *creates* the vulnerability — a check that fails open, a
> traceback handed to the attacker. Bad logging *hides* it — the intrusion
> happens and nobody ever knows. 2025 added "Mishandling of Exceptional
> Conditions" as its own category and renamed the logging category to
> include **alerting**, because logs nobody reads are not a control.
>
> **OWASP** A09:2025 Security Logging and Alerting Failures ·
> A10:2025 Mishandling of Exceptional Conditions ·
> **ASVS** V16 (Security Logging and Error Handling)

> **ASVS note** — V16 has **no Level 1 requirements**. The entire chapter
> starts at L2, so an L1-only application is not required to log security
> events at all. Do not cite a V16 requirement as an L1 failure.

## Where to look

- Every `catch` / `except` / `rescue` block, and what it does on the
  failure path.
- Global error handlers and what they return to the client.
- Authorization and authentication helpers — specifically their behaviour
  when the check itself throws.
- Log statements near credentials, request bodies, and personal data.
- Whether logs leave the machine, and whether anything alerts on them.

**Search signatures.** `except: pass`, `catch {}`, `catch (e) {}`,
`rescue nil`, `.catch(() => {})`, `on error resume next`;
`return True` / `return true` inside an exception handler;
`str(e)`, `e.message`, `printStackTrace`, `traceback` in a response;
`console.log(req`, `logger.info(payload`, `log(JSON.stringify(`.

## Failure modes

### Fail-open on a security check

An exception in an authorization, authentication, signature, or rate-limit
check is caught and treated as success. The single most dangerous pattern
in this file: an attacker who can make the check *fail* gets access, and
making a remote dependency fail is often easy.

*Confirm* — read every exception path in a security decision. It must
deny. A `try` that returns a permissive default is confirmed regardless of
how unlikely the exception looks.

*Severity* — CRITICAL.

### Silent exception swallowing

A `catch` that neither logs nor re-throws. Errors vanish, including the
ones that are an attack in progress, and the code continues on state it
believes is valid.

*Confirm* — a genuinely expected condition handled deliberately (a cache
miss, an optional parse) with a comment saying so is fine. An empty handler
around an operation whose failure matters is confirmed.

*Severity* — MEDIUM to HIGH depending on what the swallowed failure guards.

### Internal detail returned to the client

Stack traces, SQL fragments, file paths, framework versions, internal
hostnames, or raw exception messages in an HTTP response. Free
reconnaissance, and occasionally the whole exploit.

*Confirm* — ASVS 16.5.1 [L2] requires a generic message to the consumer;
detail stays in the log. The pairing that works is a generic message plus a
correlation identifier the user can quote.

*Severity* — MEDIUM; HIGH when it reveals credentials or query structure.

### Inconsistent error responses enabling enumeration

Different messages, status codes, or response times for "not found" versus
"not permitted" versus "wrong password". The difference is the oracle.

*Severity* — MEDIUM; see also `02-authentication-and-sessions.md`.

### Security events not logged

No record of authentication attempts, authorization failures, privilege
changes, password or MFA changes, administrative actions, or high-value
transactions. Detection and forensics are both impossible.

*Confirm* — ASVS 16.3.1 [L2] all authentication operations, success and
failure; 16.3.2 [L2] failed authorization (**at L3, all authorization
decisions**); 16.3.4 [L2] unexpected errors and security control failures.

*Severity* — MEDIUM to HIGH.

### Logs without usable metadata

Entries missing when, where, who, and what — no timestamp on a synchronised
clock, no request or trace identifier, no actor. Unjoinable, so unusable
during an incident.

*Confirm* — ASVS 16.2.1 [L2] and 16.2.2 [L2].

*Severity* — MEDIUM.

### Sensitive data written to logs

Passwords, tokens, session identifiers, card or personal data in log lines
— usually from a blanket request logger or an exception handler dumping
context. Log stores routinely have broader access than the database, so
this widens exposure rather than merely duplicating it.

*Confirm* — ASVS 16.2.5 [L2]. Redaction must be at the logging layer.

*Severity* — HIGH.

### Log injection

Unencoded user input written into a log. Newlines forge entries; control
characters and terminal escapes corrupt viewers; structured-log fields can
be spoofed by injecting the delimiter.

*Confirm* — ASVS 16.4.1 [L2] requires encoding to prevent log injection.
Structured logging with real field encoding is the durable fix.

*Severity* — MEDIUM.

### Logs local, unprotected, or unmonitored

Logs only on the box that produced them, writable by the application that
writes them, with no alerting. An attacker with a foothold edits them; and
nothing fires in the meantime.

*Confirm* — ASVS 16.4.2 [L2] protected from unauthorized access and
modification; 16.4.3 [L2] shipped to a logically separate system for
analysis and alerting. A09's own test is blunt: **does a penetration test
trigger an alert?** If not, the alerting is not real.

*Severity* — MEDIUM to HIGH.

### Resource exhaustion and cascading failure

No timeout, no retry budget, no circuit breaker on an external dependency.
One slow dependency exhausts the pool; retry storms amplify an outage into
an availability incident an attacker can trigger deliberately.

*Confirm* — timeouts everywhere, bounded retries with backoff and jitter,
a circuit breaker on remote calls, graceful degradation.

*Severity* — MEDIUM.

### Incomplete rollback and error-path races

A failure midway through a multi-step operation leaves partial state — a
charge without an order, a granted permission without an audit row. Error
paths also get the least concurrency testing, so TOCTOU bugs concentrate
there.

*Confirm* — transactional boundaries, or idempotent compensation. A05/A10
guidance is explicit: test error paths as thoroughly as the happy path.

*Severity* — MEDIUM to HIGH.

## When it is NOT a finding

- **The catch fully handles the case and says so.** An optional lookup where
  absence is a legitimate answer, a documented fallback, a cleanup path
  deliberately not masking the original error. The test is whether the author
  *decided what the error means* — not whether the handler is short.
- **The verbose error is behind a development-only flag.** Confirm the
  production path returns the redacted form.
- **Logging an identifier is not logging the subject.** An opaque user id in a
  log line is normal and often required for support; a name, an email or a
  token is not.
- **Absence of an alert is not absence of monitoring.** Alerting frequently
  lives outside the repository. Say that you could not see it rather than that
  it does not exist.
- **A retry that swallows an error it will re-raise after N attempts** is not a
  silent catch — provided the final failure propagates. Check the exhaustion
  path before flagging.

## Secure patterns

**Fail closed.**

```python
# UNSAFE — an exception grants access
def check_permission(user, resource):
    try:
        return auth_service.check(user, resource)
    except Exception:
        return True

# SAFE — deny, and record why
def check_permission(user, resource):
    try:
        return auth_service.check(user, resource)
    except Exception as e:
        logger.error(f"Auth check failed: {e}")
        return False
```

**Generic message out, detail in the log, correlation identifier both
ways.**

```python
# UNSAFE — internals to the client
@app.errorhandler(Exception)
def handle_error(e):
    return str(e), 500

# SAFE
@app.errorhandler(Exception)
def handle_error(e):
    error_id = uuid.uuid4()
    logger.exception(f"Error {error_id}: {e}")
    return {"error": "An error occurred", "id": str(error_id)}, 500
```

**Log security events with structure and actor.**

```python
logging.basicConfig(
    format='%(asctime)s %(levelname)s %(name)s %(message)s',
    level=logging.INFO,
)
logger = logging.getLogger('security')

@app.route('/login', methods=['POST'])
def login():
    user = authenticate(request.form['username'], request.form['password'])
    if user:
        logger.info("LOGIN_SUCCESS user=%s ip=%s", user.id, request.remote_addr)
        return redirect('/dashboard')
    logger.warning("LOGIN_FAILURE user=%s ip=%s",
                   request.form['username'], request.remote_addr)
    return "Invalid credentials", 401
```

Note the parameterised form rather than an f-string: the logging layer
encodes the values, which is also what prevents log injection.

## Review checklist

- [ ] Every security decision fails **closed** on exception
- [ ] No empty `catch` around an operation whose failure matters
- [ ] Generic error message to the consumer; detail stays in the log
      (ASVS 16.5.1)
- [ ] Correlation identifier links the user-facing error to the log entry
- [ ] Error responses consistent enough not to be an enumeration oracle
- [ ] Authentication operations logged, success and failure (16.3.1)
- [ ] Failed authorization logged (16.3.2)
- [ ] Unexpected errors and security control failures logged (16.3.4)
- [ ] Entries carry when/where/who/what on a synchronised clock
      (16.2.1, 16.2.2)
- [ ] Sensitive data handled per its protection level in logs (16.2.5)
- [ ] Log data encoded against injection (16.4.1)
- [ ] Logs protected from modification (16.4.2) and shipped off-box
      (16.4.3)
- [ ] Alerting exists and actually fires — a penetration test should
      trigger it
- [ ] Timeouts, bounded retries with backoff, and circuit breakers on
      external calls
- [ ] Multi-step operations roll back or compensate completely
- [ ] Error paths covered by tests, not just the happy path
