# Data protection

> **Attack surface** — the data itself, wherever it comes to rest: the
> database, backups, exports, caches, search indexes, analytics pipelines,
> log stores, client storage, and third-party processors. Most of this file
> is about *copies* — the primary store is usually the best-protected place
> the data ever sits, and the leak happens somewhere downstream that nobody
> classified.
>
> **ASVS** V14 (Data Protection) · related: A02:2025, A04:2025

## Where to look

- The schema: which columns hold personal, financial, health, or
  credential data. Build that list before anything else — you cannot
  protect what you have not classified.
- Every path that copies data out: export endpoints, report generators,
  admin tooling, support views, webhooks, ETL jobs, backups, fixtures
  seeded from real data.
- Serializers and API response shapes — over-fetching that returns the
  whole record when the screen needs three fields.
- Log statements and analytics events near those columns.
- Caches and search indexes: they rarely inherit the source's access
  control.
- Client-side storage and anything sent to a third-party script.
- Retention and deletion: what happens when a user asks to be erased.

**Search signatures.** Column and field names — `email`, `phone`, `dob`,
`ssn`, `national_id`, `iban`, `card`, `passport`, `address`, `salary`,
`diagnosis`; `SELECT *`, `.toJSON()`, `serialize`, `dump`, `export`,
`download`, `report`; `localStorage`, `sessionStorage`, `IndexedDB`;
`Cache-Control`, `no-store`; `?token=`, `?key=`, `?email=` in a URL.

## Failure modes

### Unclassified data

No inventory of what is sensitive, so controls are applied by intuition and
the newest table gets none.

*Confirm* — A04 mitigation 1 is "classify data by sensitivity, apply
controls accordingly". Absence of any classification is itself the finding,
and it is the one that keeps producing others.

*Severity* — MEDIUM as a process finding; it is the root of several HIGHs.

### Collecting or retaining more than needed

Fields captured because they were easy, kept forever because nobody set a
policy. Data you never collected cannot leak; data you deleted on schedule
cannot leak later.

*Confirm* — is there a retention period, and is it enforced by something
that runs? A documented policy with no job behind it is not enforcement.

*Severity* — MEDIUM.

### Over-fetching in API responses

The endpoint returns the full record — internal flags, other users'
identifiers, password hashes, soft-deleted rows — and the client renders a
subset. The data is in the response regardless of what the UI shows.

*Confirm* — read the serializer, not the screen. An explicit field
allowlist per response is the control.

*Severity* — MEDIUM to HIGH depending on the fields.

### Sensitive data in URLs

Identifiers, tokens, or personal data in a path or query string. ASVS
14.2.1 [L1] requires sensitive data to travel in the body or headers.
URLs land in access logs, proxy logs, browser history, bookmarks, and the
`Referer` header sent to third parties.

*Severity* — HIGH for credentials, MEDIUM for identifiers.

### Sensitive data in logs

Request bodies, headers, tokens, or personal fields written to logs — often
by a generic "log the whole request" helper, or by an exception handler
dumping context. Log stores usually have broader access than the database.

*Confirm* — redaction must happen at the logging layer, so it cannot be
forgotten at a call site. See `08-logging-and-error-handling.md`.

*Severity* — HIGH.

### Downstream copies without the source's controls

A cache, search index, vector store, analytics warehouse, or read replica
holding sensitive data with weaker access control than the primary — the
classic confused deputy. Search indexes are the frequent offender because
they are built to be queried broadly.

*Confirm* — a derived store must carry the same classification and the same
access control as its source, enforced **at query time**.

*Severity* — HIGH; CRITICAL if it crosses tenants.

### Non-production environments holding real data

Staging, development, or test databases seeded from a production dump.
Same data, a fraction of the controls, far broader access.

*Confirm* — anonymised or synthetic data. A "scrubbed" copy that keeps
emails or identifiers intact is not anonymised.

*Severity* — HIGH.

### Missing encryption at rest

Backups, exports, object storage, and disk volumes unencrypted — or
encrypted with a key stored beside the data.

*Severity* — MEDIUM to HIGH; a key next to the ciphertext is HIGH.

### Data sent to third parties

Analytics, error reporting, session replay, and support widgets receiving
more than they need. Session replay in particular captures form fields
unless explicitly masked.

*Confirm* — check what is masked and what the vendor's default is; defaults
tend to capture everything.

*Severity* — HIGH for personal data leaving without a control.

### Deletion that does not delete

An erasure request clears the primary row but leaves the data in backups,
logs, caches, indexes, exports, and third-party processors — with no
process to reach them.

*Confirm* — a documented, executable path for every copy identified above.

*Severity* — MEDIUM to HIGH.

### Sensitive data cached client-side

Authenticated responses without `Cache-Control: no-store`, or personal data
in `localStorage` that survives logout. ASVS 14.3.1 [L1] requires
authenticated data to be cleared from client storage on session
termination.

*Severity* — MEDIUM.

## When it is NOT a finding

- **The field is public by design.** A display name, an avatar, a public profile.
  Exposure is only a finding when the data was not meant to leave.
- **The identifier is opaque and non-enumerable.** Returning a random surrogate
  key is the mitigation, not the problem.
- **Redaction happens in the serialiser.** Field-level allowlists, response
  schemas and view models commonly strip sensitive fields after the query. Read
  the boundary that actually renders before reporting the query.
- **Client-side storage of data the client already owns.** Caching a user's own
  preferences is not a leak; caching another party's data, or a bearer token in
  a place scripts can read, is.
- **The retained data is retained deliberately** for a stated legal or
  accounting reason. Retention findings need to name the rule they violate.

## Secure patterns

**Allowlist response fields.**

```python
# UNSAFE — the whole record ships, UI hides some of it
return jsonify(user.to_dict())

# SAFE — explicit projection
return jsonify({"id": user.public_id, "name": user.name})
```

**Redact centrally, not per call site.**

```python
REDACT = {"password", "token", "authorization", "card", "ssn"}

def safe(payload: dict) -> dict:
    return {k: ("[REDACTED]" if k.lower() in REDACT else v)
            for k, v in payload.items()}

logger.info("request", extra=safe(request_body))
```

**Do not put identifiers in the URL.**

```
# UNSAFE — lands in logs, history, Referer
GET /reset?token=<secret>&email=user@example.com

# SAFE
POST /reset      {"token": "<secret>"}
```

**Expose opaque identifiers.** Sequential primary keys leak volume and
enable enumeration; a public UUID or slug for external references costs
little. Where an entity already has a public identifier, returning the
integer key instead is a finding.

## Review checklist

- [ ] Sensitive fields inventoried and classified
- [ ] Collection minimised; retention defined **and enforced by a job**
- [ ] API responses project an explicit field allowlist
- [ ] No sensitive data in URLs or query strings (ASVS 14.2.1)
- [ ] Logs redact credentials and personal data at the logging layer
- [ ] Caches, indexes, replicas, and warehouses carry the source's
      classification and enforce access control at query time
- [ ] Non-production environments use anonymised or synthetic data
- [ ] Backups, exports, and object storage encrypted; keys held separately
- [ ] Third-party scripts and processors receive only what they need;
      session replay masks input fields
- [ ] Erasure reaches every copy — backups, logs, caches, indexes,
      processors
- [ ] Authenticated responses `no-store`; client storage cleared on logout
      (14.3.1)
- [ ] External references use opaque identifiers, not sequential keys
