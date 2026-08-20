# Language footguns

> **Attack surface** — the constructs a given language makes easy that are
> unsafe by default. Load this **after** you know the stack, to turn a
> generic review into a targeted one. These are starting points, not
> coverage: every language has deeper quirks than one section can hold.

## How to use this file

Read the section for the stack, grep the **watch for** list, then check
each hit against `00-triage.md` before writing anything down. A hit is a
place to look, not a finding.

## When it is NOT a finding

A language footgun is a *default that surprises*, not a construct that can be
misused. Before reporting one:

- **Confirm the version.** Most entries below were fixed in some release. A
  footgun the project's version does not have is not a finding.
- **Confirm the default is in force.** These are defaults, and projects override
  them — a linter rule, a compiler flag, a framework preset, a wrapper used
  everywhere.
- **Confirm the value reaching it is attacker-controlled.** A dangerous parser
  fed a constant is not a vulnerability. This is the reachability gate from
  `00-triage.md`, and it applies here unchanged.
- **Do not report a language for being a language.** Manual memory management,
  dynamic typing and shell word-splitting are properties, not defects. The
  finding is a specific site where the property bites.

If the entry is generic advice rather than something you located in this
codebase, it belongs in a summary line, not in the findings list.

## The mindset for a language not listed here

When you meet an unfamiliar stack, work down these ten questions — they
generate the watch-list you do not have:

1. **Memory model** — managed or manual? Where can lifetime go wrong?
2. **Type system** — weak typing invites type-confusion and coercion bugs.
3. **Serialization** — every language has a `pickle` equivalent. All are
   dangerous on untrusted input.
4. **Concurrency** — which races, TOCTOU, and atomicity failures does this
   threading model make easy?
5. **FFI boundaries** — native interop is where type safety stops.
6. **Standard library** — historic CVEs cluster in URL, XML, and crypto
   helpers.
7. **Package ecosystem** — typosquatting, dependency confusion, install
   hooks.
8. **Build system** — build scripts execute; they are an injection target.
9. **Runtime differences** — debug versus release behaviour (overflow
   checks, assertions, error verbosity).
10. **Error handling** — how does it fail? Silently? With a stack trace?
    Open or closed?

---

## JavaScript / TypeScript

**Main risks** — prototype pollution, XSS, `eval` injection.

```javascript
// UNSAFE: prototype pollution
Object.assign(target, userInput)
// SAFE: null-prototype target, or validate keys
Object.assign(Object.create(null), validated)

// UNSAFE
eval(userCode)
// SAFE: never eval user input
```

**Watch for** — `eval()`, `new Function`, `innerHTML`, `outerHTML`,
`document.write()`, `dangerouslySetInnerHTML`, `__proto__`,
`constructor.prototype`, `child_process.exec`, `vm` module,
`JSON.parse` on untrusted input feeding a merge.

TypeScript types are erased at runtime: a value typed `string` can be an
object at the boundary. Validate at the edge.

---

## Python

**Main risks** — pickle deserialization, format-string injection, shell
injection.

```python
# UNSAFE: pickle is RCE on untrusted input
pickle.loads(user_data)
# SAFE
json.loads(user_data)

# UNSAFE
query = "SELECT * FROM users WHERE name = '%s'" % user_input
# SAFE
cursor.execute("SELECT * FROM users WHERE name = %s", (user_input,))
```

**Watch for** — `pickle`, `marshal`, `shelve`, `yaml.load` (use
`safe_load`), `eval()`, `exec()`, `os.system()`, `subprocess(..., shell=True)`,
`.format()` on a user-controlled format string, `tarfile.extractall`
(path traversal), `assert` used as a security check (stripped under `-O`).

---

## Java

**Main risks** — deserialization RCE, XXE, JNDI injection.

```java
// UNSAFE: arbitrary deserialization
ObjectInputStream ois = new ObjectInputStream(userStream);
Object obj = ois.readObject();

// SAFE: typed JSON binding
ObjectMapper mapper = new ObjectMapper();
mapper.readValue(json, SafeClass.class);
```

**Watch for** — `ObjectInputStream`, `Runtime.exec()`,
`ProcessBuilder` with a built string, XML parsers without XXE hardening,
JNDI lookups on user input, expression-language evaluation, reflection
driven by user input.

---

## C#

**Main risks** — deserialization, SQL injection, path traversal.

```csharp
// UNSAFE: BinaryFormatter is RCE
BinaryFormatter bf = new BinaryFormatter();
object obj = bf.Deserialize(stream);

// SAFE
var obj = JsonSerializer.Deserialize<SafeType>(json);
```

**Watch for** — `BinaryFormatter`, `JavaScriptSerializer`, `LosFormatter`,
`TypeNameHandling.All`, raw SQL strings, `Path.Combine` with user input
(an absolute second argument discards the first), XML resolvers.

---

## PHP

**Main risks** — type juggling, file inclusion, object injection.

```php
// UNSAFE: loose comparison in an auth path
if ($password == $stored_hash) { ... }
// SAFE
if (hash_equals($stored_hash, $candidate)) { ... }

// UNSAFE: file inclusion
include($_GET['page'] . '.php');
// SAFE: allowlist
$allowed = ['home', 'about'];
include(in_array($page, $allowed, true) ? "$page.php" : 'home.php');
```

**Watch for** — `==` where `===` is meant, `include`/`require` with user
input, `unserialize()`, `extract()`, `preg_replace` with the `/e`
modifier, `$$variable`, superglobals used unfiltered.

---

## Go

**Main risks** — data races, template injection, unchecked bounds.

```go
// UNSAFE: data race
go func() { counter++ }()
// SAFE
atomic.AddInt64(&counter, 1)

// UNSAFE: bypasses contextual escaping
template.HTML(userInput)
// SAFE: let html/template escape it
{{.UserInput}}
```

**Watch for** — goroutine data races (run the race detector),
`template.HTML` / `template.JS` / `template.URL` conversions,
`text/template` used for HTML output, the `unsafe` package, ignored
`error` returns, unchecked slice indexing.

---

## Ruby

**Main risks** — mass assignment, YAML deserialization, regex DoS.

```ruby
# UNSAFE: mass assignment
User.new(params[:user])
# SAFE: strong parameters
User.new(params.require(:user).permit(:name, :email))

# UNSAFE: YAML can instantiate objects
YAML.load(user_input)
# SAFE
YAML.safe_load(user_input)
```

**Watch for** — `YAML.load`, `Marshal.load`, `eval`, `send`/`public_send`
with user input, `.permit!`, `constantize` on user input, `%r` patterns
built from user input, `^`/`$` anchors where `\A`/`\z` were meant.

---

## Rust

**Main risks** — `unsafe` blocks, FFI boundaries, release-mode integer
overflow.

```rust
// CAUTION: unsafe opts out of the guarantees
unsafe { ptr::read(user_ptr) }

// CAUTION: overflow panics in debug, wraps in release
let x: u8 = 255;
let y = x + 1;                       // 0 in release
// SAFE
let y = x.checked_add(1).unwrap_or(255);
```

**Watch for** — `unsafe` blocks, FFI declarations, `.unwrap()` /
`.expect()` on untrusted input (denial of service via panic), integer
overflow in release builds, `mem::transmute`.

---

## Swift

**Main risks** — force unwrapping, Objective-C interop.

```swift
// UNSAFE: crashes on untrusted data
let value = jsonDict["key"]!
// SAFE
guard let value = jsonDict["key"] else { return }

// UNSAFE: user input as a format string
String(format: userInput, args)
```

**Watch for** — force unwrap `!`, `try!`, Objective-C bridging,
`NSSecureCoding` misuse, keychain accessibility set too permissively.

---

## Kotlin

**Main risks** — null-safety bypass via Java interop, serialization.

```kotlin
// UNSAFE: platform type from Java can be null
val len = javaString.length
// SAFE
val len = javaString?.length ?: 0
```

**Watch for** — platform types from Java interop, the `!!` operator,
reflection driven by user input, Java serialization inherited through
interop.

---

## C / C++

**Main risks** — buffer overflow, use-after-free, format string.

```c
// UNSAFE
char buf[10]; strcpy(buf, userInput);
// SAFE (still check truncation)
strncpy(buf, userInput, sizeof(buf) - 1);

// UNSAFE
printf(userInput);
// SAFE
printf("%s", userInput);
```

**Watch for** — `strcpy`, `strcat`, `sprintf`, `gets`, `alloca`,
pointer arithmetic on attacker-influenced offsets, manual `free` paths,
signed/unsigned confusion, integer overflow before an allocation.

---

## Scala

**Main risks** — XXE, Java-inherited serialization, non-exhaustive
matching.

```scala
// UNSAFE: XXE
val xml = XML.loadString(userInput)
// SAFE: disable external entities
val factory = SAXParserFactory.newInstance()
factory.setFeature(
  "http://xml.org/sax/features/external-general-entities", false)
```

**Watch for** — XML parsing, `Serializable` via Java interop,
non-exhaustive pattern matches on untrusted input.

---

## R

**Main risks** — code injection, path manipulation.

```r
# UNSAFE
eval(parse(text = user_input))
# SAFE: never parse user input as code

# UNSAFE
read.csv(paste0("data/", user_file))
# SAFE
if (grepl("^[a-zA-Z0-9]+\\.csv$", user_file)) read.csv(...)
```

**Watch for** — `eval()`, `parse()`, `source()`, `system()`,
`file.path` built from user input.

---

## Perl

**Main risks** — regex injection, two-argument `open`, taint bypass.

```perl
# UNSAFE: user-supplied pattern
$input =~ /$user_pattern/;
# SAFE
$input =~ /\Q$user_pattern\E/;

# UNSAFE: two-arg open interprets mode characters
open(FILE, $user_file);
# SAFE
open(my $fh, '<', $user_file);
```

**Watch for** — two-arg `open()`, patterns from user input, backticks,
`eval`, taint mode disabled.

---

## Shell (Bash)

**Main risks** — command injection, word splitting, globbing.

```bash
# UNSAFE: word splitting and globbing
rm $user_file
# SAFE
rm -- "$user_file"

# UNSAFE
eval "$user_command"
```

**Watch for** — unquoted variable expansions, `eval`, backticks and
`$( )` containing user input, missing `set -euo pipefail`, `IFS` left at
its default while parsing untrusted text, a variable used as a command
name, missing `--` before user-controlled arguments.

---

## Lua

**Main risks** — sandbox escape, `loadstring` injection.

```lua
-- UNSAFE
loadstring(user_code)()
-- SAFE: restricted environment, no io/os/debug
```

**Watch for** — `loadstring`, `load`, `loadfile`, `dofile`,
`os.execute`, the `io` and `debug` libraries reachable from a sandbox.

---

## Elixir

**Main risks** — atom exhaustion, code injection.

```elixir
# UNSAFE: atoms are never garbage collected
String.to_atom(user_input)
# SAFE
String.to_existing_atom(user_input)

# UNSAFE
Code.eval_string(user_input)
```

**Watch for** — `String.to_atom`, `Code.eval_string`,
`:erlang.binary_to_term` without `[:safe]`, public ETS tables.

---

## Dart / Flutter

**Main risks** — insecure local storage, platform-channel data.

```dart
// UNSAFE: plaintext on device
prefs.setString('auth_token', token);
// SAFE
secureStorage.write(key: 'auth_token', value: token);
```

**Watch for** — secrets in shared preferences, unvalidated platform
channel payloads, `Function.apply`, secrets compiled into the bundle
(a shipped app is readable).

---

## PowerShell

**Main risks** — command injection, execution-policy bypass.

```powershell
# UNSAFE
Invoke-Expression $userInput

# UNSAFE
Get-Content $userPath
# SAFE: validate the resolved path is inside an allowed root
```

**Watch for** — `Invoke-Expression`, `& $userVar`, `Start-Process` with
user-built arguments, `-ExecutionPolicy Bypass`, `ConvertTo-SecureString`
with a plaintext key.

---

## SQL (all dialects)

**Main risks** — injection, privilege escalation, bulk exfiltration.

```sql
-- UNSAFE: concatenation
"SELECT * FROM users WHERE id = " + userId

-- SAFE: prepared statement, always
```

**Watch for** — dynamic SQL inside stored procedures,
`EXECUTE IMMEDIATE`, `sp_executesql` with a built string, broad `GRANT`s,
application accounts holding DDL rights, missing row limits on queries
that can return the whole table.
