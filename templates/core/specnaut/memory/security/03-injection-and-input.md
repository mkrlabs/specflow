# Injection and input handling

> **Attack surface** — every point where data crosses from the outside world
> into an interpreter: a database, a shell, a parser, a template engine, a
> browser DOM, an HTTP client, the filesystem. The defect is always the
> same shape: **data and instructions share one channel**, so an attacker
> who controls the data controls the instruction.
>
> **OWASP** A05:2025 Injection · **ASVS** V1 (Encoding and Sanitization),
> V2 (Validation and Business Logic), V5 (File Handling)

## The two principles

1. **Separate the channel.** Parameterized queries, argument arrays instead
   of shell strings, structured APIs instead of string building. This is the
   only real fix; escaping is the fallback for when it is impossible.
2. **Validate positively, server-side.** Allowlist what is acceptable rather
   than denylisting what is not — a denylist is a bet that you thought of
   every encoding, and you did not. Client-side validation is usability, not
   security (ASVS 2.2.2).

## Where to look

- Any string built with concatenation, interpolation, or `+` that ends up in
  `execute`, `query`, `raw`, `exec`, `system`, `render`, `eval`.
- ORM escape hatches: `raw`, `literal`, `unsafe`, `expr`, `whereRaw`.
- Template rendering that marks content as trusted HTML.
- DOM sinks in frontend code.
- Filesystem calls whose path is built from a request value.
- HTTP clients whose URL is built from a request value.
- Deserialization of anything that did not come from your own trusted store.
- File upload handlers.

**Search signatures.** `execute(f"`, `query("... " +`, `${` inside SQL;
`shell=True`, `os.system`, `exec(`, `eval(`, `new Function`, `Runtime.exec`,
`child_process.exec`; `innerHTML`, `outerHTML`, `document.write`,
`dangerouslySetInnerHTML`, `v-html`, `bypassSecurityTrust`; `pickle`,
`Marshal.load`, `YAML.load`, `ObjectInputStream`, `BinaryFormatter`,
`unserialize`; `path.join(` with request data, `../`; `requests.get(url`,
`fetch(url` where `url` is user-supplied.

## Failure modes

### SQL injection

User input concatenated into a query. Still the archetype, still present,
usually in the one query someone wrote by hand because the ORM was awkward.

*Confirm* — the value must reach the driver as a **bound parameter**, not as
query text. String-building plus manual escaping is confirmed: escaping is
dialect-specific and gets it wrong on encoding, comments, and numeric
contexts.

*Severity* — CRITICAL.

### NoSQL / query-object injection

The request body is passed straight into a query document. A JSON body can
smuggle an operator object where the code expected a string —
`{"username": {"$ne": null}}` matches every user.

*Confirm* — the type must be validated before use. A route that trusts the
parsed body's shape is confirmed.

*Severity* — HIGH to CRITICAL depending on whether it bypasses auth.

### OS command injection

User input interpolated into a shell string, or passed to an API that spawns
a shell.

*Confirm* — the call must pass an **argument array** with the shell
disabled. `shell=True` with any interpolated value is confirmed. Note that
even an argument array is unsafe if the *program* name is user-controlled.

*Severity* — CRITICAL.

### Dynamic code execution

`eval`, `exec`, `new Function`, `loadstring`, `Code.eval_string`,
`Invoke-Expression`, or a template engine compiling user input. ASVS 1.3.2
[L1] says simply: avoid it.

*Severity* — CRITICAL when reachable with user input.

### Server-side template injection

User input rendered *as a template* rather than *into* one. Most engines
expose object traversal, which turns into code execution.

*Confirm* — the template must be a constant; user data must be a context
variable. A template string built with interpolation is confirmed.

*Severity* — CRITICAL.

### Cross-site scripting

Untrusted data reaching the browser as markup or script.

- **Stored** — persisted and served to other users. Worst impact.
- **Reflected** — echoed from the request.
- **DOM-based** — never touches the server; a client-side sink does it.

*Confirm* — modern frameworks escape by default, so the finding is almost
always an explicit opt-out: `dangerouslySetInnerHTML`, `v-html`,
`innerHTML`, `template.HTML()`, `bypassSecurityTrust*`, `|safe`,
`raw`. Check whether the value is sanitized with a real HTML sanitizer
first. Encoding must match the context — HTML body, attribute, URL, and
JavaScript contexts each need different encoding (ASVS 1.2.1–1.2.3).

*Severity* — HIGH; CRITICAL if stored and reaching authenticated sessions.

### XML external entity (XXE)

An XML parser left in its default configuration resolves external entities,
giving file read and often SSRF.

*Confirm* — external entity resolution and DTD processing must be disabled
(ASVS 1.5.1). Also applies to formats that are XML underneath: SVG uploads,
office documents, SOAP, some config loaders.

*Severity* — HIGH to CRITICAL.

### Path traversal

A filesystem path built from user input. `../` sequences, absolute paths,
symlinks, or encoded variants escape the intended directory.

*Confirm* — the fix is **normalize, then verify the resolved path is inside
the allowed root** — not "strip `../`", which loses to encoding and to
`....//`. Best is not to accept a path at all: accept an opaque identifier
and map it server-side.

*Severity* — HIGH; CRITICAL if it reaches a write or a config file.

### Unrestricted file upload

Type trusted from the client, filename used on disk, files stored inside
the web root, no size limit.

*Confirm* — validate content by inspection rather than by extension or
`Content-Type`; generate the stored name server-side; store outside the web
root or on a host that cannot execute; cap size and count.

*Severity* — CRITICAL if an uploaded file can be executed or served as
active content.

### Unsafe deserialization

Deserializing attacker-controlled bytes into objects. Most languages have a
format that runs code on load — `pickle`, `Marshal`, `YAML.load`,
`ObjectInputStream`, `BinaryFormatter`, `unserialize`.

*Confirm* — must be a data-only format (JSON) plus schema validation, or a
type allowlist. Deserializing a signed blob you produced yourself is
acceptable **only** if the signature is verified before deserialization.

*Severity* — CRITICAL.

### Server-side request forgery (SSRF)

A URL built from user input is fetched by the server, which sits inside the
network perimeter. Reaches internal services and cloud metadata endpoints.

*Confirm* — an allowlist of hosts or a dedicated egress proxy. Blocklists of
private ranges lose to DNS rebinding, redirects, and alternate IP encodings,
so also: resolve first and validate the resolved address, and do not follow
redirects blindly. **Severity depends on what is reachable** — a metadata
endpoint that hands out credentials is a different finding from
`localhost`-only.

*Severity* — HIGH to CRITICAL.

### Open redirect

A redirect target taken from the request. Low impact alone; a strong
phishing primitive, and it chains with OAuth flows.

*Severity* — LOW to MEDIUM alone, HIGH inside an authentication flow.

### Regular-expression denial of service (ReDoS)

A pattern with catastrophic backtracking applied to user input, or a pattern
built *from* user input.

*Confirm* — nested quantifiers over overlapping character classes. Cap input
length, use a linear-time engine, or escape user-supplied patterns.

*Severity* — MEDIUM.

### Missing input constraints

No length cap, no range check, no type check. Enables ReDoS, memory
exhaustion, integer overflow, and downstream truncation bugs.

*Severity* — LOW to MEDIUM alone; often the enabler for something worse.

## When it is NOT a finding

- **The value is not attacker-controlled.** Trace it to a real entry point. A
  constant, an enum, an internal config key, or a column the user cannot write
  is not an injection source, however dynamic the string construction looks.
- **A parameterised query with dynamic *shape*.** Building a `WHERE` clause from
  an allowlisted column name while values stay bound is not SQL injection. Check
  whether the interpolated part is an identifier from a fixed set.
- **The framework escapes by default on that path.** Most template and view
  layers escape output unless explicitly told not to. The finding is the
  explicit opt-out, not the ordinary render.
- **The sink is not an interpreter.** String concatenation into a log line, a
  filename you then validate, or a message body is not injection unless
  something downstream parses it. Name the interpreter or drop the finding.
- **Validation happens at the boundary you did not read.** A schema applied by
  middleware or a typed request object may already bound the value.

## Secure patterns

**SQL — parameterize.**

```python
# UNSAFE
cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")

# SAFE
cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
```

**Shell — argument array, no shell.**

```python
# UNSAFE
os.system(f"convert {filename} output.png")

# SAFE
subprocess.run(["convert", filename, "output.png"], shell=False)
```

**NoSQL — validate the type before it becomes a query.**

```javascript
// UNSAFE — an object body becomes an operator
db.users.find({ username: req.body.username })

// SAFE — pin the type first
if (typeof req.body.username !== 'string') throw new Error('bad input');
db.users.find({ username: req.body.username })
```

**Filesystem — resolve, then verify containment.**

```python
# UNSAFE
open(os.path.join(UPLOAD_DIR, request.args["name"]))

# SAFE
target = (UPLOAD_DIR / request.args["name"]).resolve()
if not target.is_relative_to(UPLOAD_DIR.resolve()):
    abort(400)
open(target)
```

**Deserialization — data-only format plus schema.**

```python
# UNSAFE — executes on load
data = pickle.loads(user_input)

# SAFE
data = json.loads(user_input)
validate_schema(data)
```

**Validate positively.**

```python
# UNSAFE — denylist; loses to the encoding you did not think of
if "<script" in value:
    abort(400)

# SAFE — allowlist; anything unexpected is rejected by construction
if not re.fullmatch(r"[a-z0-9_-]{1,32}", value):
    abort(400)
```

## Review checklist

- [ ] All data access uses parameterized queries, an ORM, or an entity
      framework (ASVS 1.2.4)
- [ ] OS calls use parameterized invocation, never a built shell string
      (1.2.5)
- [ ] No `eval()` or dynamic code execution reachable with user input
      (1.3.2)
- [ ] Output encoding matches the context — HTML, attribute, URL,
      JavaScript/JSON (1.2.1–1.2.3)
- [ ] XML parsers restrictively configured; external entities disabled
      (1.5.1)
- [ ] Input validated against business expectations, allowlist preferred
      (2.2.1)
- [ ] Validation enforced at a trusted server-side layer (2.2.2)
- [ ] Length, type, and range limits enforced on every accepted field
- [ ] Filesystem paths resolved and verified inside an allowed root
- [ ] Uploads: content-inspected, server-generated names, stored
      non-executable, size-capped
- [ ] No deserialization of untrusted input in a code-executing format
- [ ] Outbound URLs allowlisted; redirects not followed blindly
- [ ] Redirect targets validated against an allowlist
- [ ] Queries that can return many rows are paginated and capped
- [ ] Language-specific sinks reviewed — see `10-language-footguns.md`
