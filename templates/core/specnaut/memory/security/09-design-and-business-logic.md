# Design and business logic

> **Attack surface** — the features themselves. Every defect in this file is
> reachable by making perfectly well-formed requests in an order or at a
> rate nobody planned for. No payload, no malformed input, nothing a
> scanner detects. **Insecure design cannot be fixed by a perfect
> implementation** — the control was never specified, so there is nothing to
> implement correctly.
>
> **OWASP** A06:2025 Insecure Design · **ASVS** V2.3 (Business Logic)

## Why this is the hardest file to use

The other files give you signatures to grep. This one does not, because
the defect is the *absence* of something. The only method that works is to
read a feature and ask what an attacker would do with it if they were
patient, automated, and had a thousand accounts.

Four questions per feature:

1. **What if this runs a million times?** Rate, cost, volume.
2. **What if the steps happen out of order, or one is skipped?**
3. **What if two of these run at exactly the same moment?**
4. **Who pays when it goes wrong, and can the attacker make that happen?**

## Where to look

- Multi-step flows: checkout, onboarding, verification, approval,
  refund, cancellation, transfer.
- Anything that costs money, sends a message, or consumes a quota on each
  invocation.
- Anything with a numeric quantity, price, discount, balance, or credit.
- Anything with a state machine, explicit or implied by boolean columns.
- Invitations, referrals, trials, coupons, free tiers.
- Operations that touch a shared counter or balance.

## Failure modes

### No rate limiting on an expensive or sensitive operation

Login, password reset, verification-code entry, search, export, report
generation, file conversion, outbound email or SMS, any paid third-party
call. Unlimited attempts break authentication controls; unlimited cost
becomes denial of wallet.

*Confirm* — limits must be **server-side and per-identity** — per account,
per IP, and per API key as appropriate. A client-side debounce is not a
limit. Check the reset path specifically: it is the most commonly forgotten.

*Severity* — HIGH on authentication paths, MEDIUM to HIGH elsewhere
depending on cost.

### Business-flow steps skippable or reorderable

A flow assumed to run in order — cart, then payment, then fulfilment;
upload, then scan, then publish — where a later step can be called
directly. The skipped step is usually the one that validates or charges.

*Confirm* — ASVS 2.3.1 [L1] requires business logic flows to execute in the
expected sequential order without skipped steps. Server-side state must
enforce the sequence; a hidden form field, a wizard step number, or a
client-held flag does not.

*Severity* — HIGH to CRITICAL when the skipped step is payment,
verification, or approval.

### Client-supplied values that should be server-derived

Price, quantity, discount, currency, tax, tier, expiry, or role arriving in
the request and used as-is. The classic is a negative quantity turning a
purchase into a credit.

*Confirm* — the server must look up authoritative values and validate
ranges. Also check the boundaries: zero, negative, very large, and
non-integer where an integer is assumed.

*Severity* — CRITICAL for anything financial.

### Race conditions on shared state

Two concurrent requests both pass a check before either commits: a coupon
redeemed twice, a balance withdrawn twice, a one-per-account limit
exceeded, a seat double-booked. Any read-then-write without atomicity.

*Confirm* — an atomic conditional update, a transaction at the right
isolation level, a lock, or a database constraint. A uniqueness constraint
is the most durable answer because it cannot be forgotten at a call site.

*Severity* — HIGH; CRITICAL where money or entitlements are involved.

### Missing idempotency

A retry, double-click, or webhook redelivery repeats the effect: a second
charge, a duplicate order, a repeated payout. Networks retry by design, so
this fires without an attacker.

*Confirm* — an idempotency key, or a natural uniqueness constraint on the
operation.

*Severity* — MEDIUM to HIGH.

### Trusting an unverified callback

A webhook or redirect from a payment, identity, or messaging provider
accepted without verifying its signature, or a client-side success redirect
treated as proof the operation succeeded.

*Confirm* — verify the provider's signature server-side, and confirm the
outcome by querying the provider rather than trusting the callback body.

*Severity* — CRITICAL for payment and identity callbacks.

### Unbounded resource consumption

No pagination ceiling, no export row cap, no upload size limit, no
recursion depth limit, no query timeout. One request consumes what the
system needed for everyone.

*Confirm* — A06 mitigation 6: limit resource consumption per user and per
service.

*Severity* — MEDIUM.

### Missing tenant or resource isolation in the design

Quotas, connection pools, worker queues, or caches shared such that one
tenant's load or one tenant's data affects another. Distinct from the
access-control failure in `01`: here the isolation was never designed, so
there is no check to have forgotten.

*Severity* — HIGH.

### Abusable incentives

Referral bonuses, trials, free credits, or promotions with no
self-referral check, no per-person limit, no identity verification, and no
review of aggregate behaviour. Not a memory-safety bug; still a direct
financial loss.

*Confirm* — A06 mitigation 4 asks for fraud controls designed in. Absence
of any anti-abuse control on a feature that grants value is the finding.

*Severity* — MEDIUM to HIGH.

### No threat model

No record of what this system is protecting, from whom, and which controls
answer which threat. Every finding above becomes ad hoc, and coverage is
whatever the last reviewer happened to think of.

*Confirm* — A06 mitigations 1–4: a secure development lifecycle, a library
of secure design patterns, threat modelling for authentication, access
control, and critical business flows, and security requirements written
into user stories.

*Severity* — MEDIUM as a process finding.

## When it is NOT a finding

This file has the highest false-positive rate in the base, because "this feels
abusable" is a hypothesis, not evidence. Be stricter here than anywhere else.

- **The limit is enforced elsewhere** — at the edge, in a queue, by a quota
  service, by the payment provider. Business-logic abuse is very often bounded
  outside the code path you are reading.
- **The race you found needs a window you have not shown exists.** A
  check-then-act pattern under a database transaction, a unique constraint, or
  an idempotency key is not a race. Name the mechanism that would have to be
  absent.
- **The "free" path costs the attacker more than it costs you.** Abuse findings
  need an economic argument, not just a possible sequence of calls.
- **The workflow skip is caught by reconciliation.** A state machine that can be
  entered out of order but is corrected by a downstream check is a robustness
  issue, not a vulnerability.
- **You are describing a product decision.** Generous refunds, permissive trials
  and lenient quotas are choices. Report the mechanism, and let the owner judge
  the policy — do not report the policy as a defect.

## Secure patterns

**Rate limit, validate, and answer uniformly.**

```python
# UNSAFE — unlimited, and it confirms which accounts exist
@app.route('/password-reset', methods=['POST'])
def password_reset():
    send_reset_email(request.form['email'])
    return "Email sent"

# SAFE — limited, validated, enumeration-resistant, constant-ish timing
@app.route('/password-reset', methods=['POST'])
@limiter.limit("3 per hour")
def password_reset():
    email = request.form['email']
    if not is_valid_email_format(email):
        abort(400)
    send_reset_email_async(email)          # same timing either way
    return "If account exists, email was sent"
```

**Derive value server-side.**

```python
# UNSAFE — the client sets the price
total = request.json["price"] * request.json["quantity"]

# SAFE — authoritative lookup, validated range
product = catalog.get(request.json["product_id"])
qty = request.json["quantity"]
if not isinstance(qty, int) or not 1 <= qty <= product.max_per_order:
    abort(400)
total = product.price_cents * qty
```

**Make the race impossible rather than unlikely.**

```sql
-- UNSAFE — check then write; two requests both pass the check
SELECT remaining FROM coupons WHERE code = $1;    -- app compares > 0
UPDATE coupons SET remaining = remaining - 1 WHERE code = $1;

-- SAFE — atomic conditional update; the second request affects 0 rows
UPDATE coupons SET remaining = remaining - 1
WHERE code = $1 AND remaining > 0
RETURNING remaining;
```

## Review checklist

- [ ] Rate limits on authentication, reset, verification, search, export,
      and every paid outbound call — server-side, per identity
- [ ] Multi-step flows enforce order and completeness server-side
      (ASVS 2.3.1)
- [ ] Prices, quantities, tiers, and roles derived server-side, never
      trusted from the request
- [ ] Numeric inputs range-checked, including zero, negative, and overflow
- [ ] Read-then-write on shared state made atomic, or backed by a
      constraint
- [ ] Repeatable operations are idempotent
- [ ] Provider callbacks signature-verified; outcomes confirmed
      server-to-server
- [ ] Pagination, export, upload, recursion, and query limits capped
- [ ] Tenant isolation designed into quotas, pools, queues, and caches
- [ ] Value-granting features carry anti-abuse controls
- [ ] Critical flows have a threat model, and its controls are traceable to
      requirements
- [ ] Abuse cases are tested, not just the happy path
