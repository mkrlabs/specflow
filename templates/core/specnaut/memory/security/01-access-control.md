# Access control

> **Attack surface** — every route, handler, resolver, job, and query that
> returns or mutates data belonging to someone. The attacker is usually
> authenticated and legitimate; they simply ask for a resource that is not
> theirs, or for an operation above their role. Broken access control has
> been the OWASP #1 category since 2021 and stayed there in 2025, because
> it is the one class no framework fixes for you.
>
> **OWASP** A01:2025 Broken Access Control · **ASVS** V8 (Authorization)

## Where to look

- Route definitions and their decorators/middleware — build the full list
  first, then diff it against the list that carries an authorization check.
- Handlers taking an identifier from the request: `/:id`, `?user_id=`,
  `{orgId}`, a filename, a document key.
- Every write path: `POST`, `PUT`, `PATCH`, `DELETE`, GraphQL mutations,
  RPC methods, background jobs triggered by user action.
- Query builders that accept a filter object straight from the request.
- Admin surfaces: anything named `admin`, `internal`, `debug`, `ops`,
  `impersonate`, `sudo`, `su`.
- Client-side gating: a hidden button, a disabled field, a role check in
  the frontend router. Client-side checks are usability, never security.
- CORS configuration and any response header set to `*`.

**Search signatures.** Route tables and their guards; `req.params`,
`request.args`, `params[:id]` flowing directly into a lookup; `findById`,
`get_object_or_404`, `.get(id)` without an ownership predicate;
`is_admin`, `role ==`, `hasRole` compared in the frontend;
`Access-Control-Allow-Origin`.

## Failure modes

### Insecure direct object reference (IDOR / BOLA)

The handler authenticates the caller but then loads the record by the
identifier the caller supplied, without checking that the record belongs to
them. Incrementing the ID walks the whole table.

*Exploit* — log in as any user, change `1042` to `1041`, read the response.

*Confirm* — find the ownership predicate. It must be in the query
(`WHERE id = ? AND owner_id = ?`) or in an explicit check after the load.
A route that loads first and checks nothing is confirmed. If enforcement is
in a policy layer or a scoped repository, it is not a finding — verify the
scoping applies to *this* query.

*Severity* — HIGH; CRITICAL if the data is financial, medical, credential,
or bulk-enumerable.

### Missing function-level authorization

The route is authenticated but not authorized: any logged-in user can call
an operation intended for a specific role. Frequently the read path is
guarded and the corresponding write path is not.

*Confirm* — pair every read route with its write counterpart and compare
their guards. Asymmetry is the tell.

*Severity* — HIGH; CRITICAL when the operation is administrative.

### Privilege escalation through mass assignment

The handler binds a request body straight onto a model, and the body
carries a field the user should not control — `role`, `is_admin`,
`org_id`, `verified`, `balance`, `plan`.

*Confirm* — look for an allowlist of writable fields. Its absence on a
model that has any privilege-bearing column is confirmed.

*Severity* — CRITICAL when a role or tenancy field is bindable.

### Missing tenant isolation

Multi-tenant data is separated by a filter the application adds, and one
query path forgets it — a report, an export, an admin tool, a cache key, a
search index, a webhook replay.

*Confirm* — the tenant predicate must be enforced somewhere structural: a
scoped connection, a row-level policy, a repository that cannot be bypassed.
"Every developer remembers to add `WHERE tenant_id = ?`" is not isolation.

*Severity* — CRITICAL. Cross-tenant leakage is the worst outcome a
multi-tenant system has.

### Authorization decided on client-supplied claims

The server trusts a role, tenant, or permission that arrived in the request
— a header, a body field, a cookie, or an unverified token claim.

*Confirm* — trace the claim to its source. It must come from a server-side
session lookup or a signature-verified token. See
`02-authentication-and-sessions.md` for token verification.

*Severity* — CRITICAL.

### Path and route bypass

Access control keyed on a string that has more than one spelling:
case differences, trailing slashes, URL encoding, path traversal segments,
or an HTTP method the guard did not enumerate (`HEAD`, `OPTIONS`).

*Confirm* — check whether the guard matches on a normalized path and on all
methods, or on a raw string.

*Severity* — HIGH.

### CORS misconfiguration

`Access-Control-Allow-Origin` reflects the request `Origin`, or is `*`
together with `Access-Control-Allow-Credentials: true`. Any site the victim
visits can then read authenticated responses.

*Confirm* — an origin allowlist is required. Reflection plus credentials is
confirmed; `*` without credentials is usually MEDIUM.

*Severity* — HIGH with credentials, MEDIUM without.

### Directory listing and exposed artefacts

Web root serves `.git/`, `.env`, `*.bak`, source maps, or an index listing.

*Severity* — CRITICAL if it exposes source or credentials, MEDIUM otherwise.

## When it is NOT a finding

Read this before writing an access-control finding. These are the shapes that
look exactly like a hole and are not.

- **Enforcement is centralised and you grepped per-route.** Middleware, a base
  controller, a policy layer, a route decorator, a framework guard applied at
  mount. Enforcement is centralised far more often than it is per-handler, so a
  per-route search reports every route in the codebase. Find where the project
  enforces before claiming a route does not.
- **The identifier is unguessable *and* unenumerable, and that is the design.**
  A capability URL — a signed share link, a one-time token — is an intentional
  access model, not a missing check. Say so; the finding, if any, is about
  expiry or revocation, not about the absence of a lookup.
- **The "missing" check is downstream.** A handler that passes a subject to a
  query which itself scopes by owner has an ownership check; it is just not in
  the function you read. Follow the call before flagging.
- **The route is deliberately public.** Health checks, static assets, sign-up,
  a public profile. Confirm the data it returns is public too — that is the
  real question — but do not report the absence of auth as the defect.
- **The actor cannot exist.** A role-gated path where the role is never granted
  in this deployment is a latent issue at most. Say which it is.

If you cannot show the path is reachable by someone who should not reach it,
you have a **suspicion**. Label it as one.

## Secure patterns

**Enforce ownership in the query, not after it.**

```python
# UNSAFE — authenticated, but not authorized
@app.route('/api/user/<user_id>')
def get_user(user_id):
    return db.get_user(user_id)

# SAFE — identity from the session, ownership enforced explicitly
@app.route('/api/user/<user_id>')
@login_required
def get_user(user_id):
    if current_user.id != user_id and not current_user.is_admin:
        abort(403)
    return db.get_user(user_id)
```

**Better: make the unsafe query unwriteable.** Scope at the repository or
connection level so a forgotten predicate is impossible rather than merely
discouraged.

```python
# The caller cannot express a cross-tenant query
repo = InvoiceRepository(tenant=current_user.tenant_id)
invoice = repo.get(invoice_id)   # WHERE id = ? AND tenant_id = ?
```

**Allowlist writable fields.**

```ruby
# UNSAFE — role is bindable
User.new(params[:user])

# SAFE — explicit allowlist
User.new(params.require(:user).permit(:name, :email))
```

**Deny by default.** The default for a new route must be "no access", so
that forgetting a guard fails closed. A framework where an unannotated
route is public is a design problem worth its own finding.

## Review checklist

- [ ] Authorization is enforced server-side, at a layer the client cannot
      influence (ASVS 8.3.1)
- [ ] Function-level access restricted to consumers with explicit
      permissions (8.2.1)
- [ ] Data-level access restricted per record — ownership or tenancy
      checked on every read *and* write (8.2.2)
- [ ] Deny by default: a route with no explicit rule is inaccessible
- [ ] Access control implemented once and reused, not re-derived per route
- [ ] Records fetched by ownership predicate, not by user-supplied ID alone
- [ ] Writable fields allowlisted; no privilege field is bindable
- [ ] Tenant isolation is structural, not a convention
- [ ] CORS uses an origin allowlist; no reflection, no `*` with credentials
- [ ] Directory listing disabled; no source, backups, or dotfiles in the
      web root
- [ ] Access-control failures are logged and alert on repetition
      (see `08-logging-and-error-handling.md`)
- [ ] Sensitive endpoints are rate limited
      (see `09-design-and-business-logic.md`)
