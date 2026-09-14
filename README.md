![marmota](docs/logo.png)

marmota is a command-line AI agent runtime that runs entirely on your own
machine, built on the assumption that everything the agent reads is
potentially hostile.

```
$ marmota
marmota -- type a message. Ctrl-C cancels a turn, Ctrl-D exits.
> fix the off-by-one in the pagination helper and show me the diff
→ read_file {"path":"src/paginate.js"}
→ write_file {"path":"src/paginate.js","content":"..."}

------------------------------------------------------------
write_file /home/you/projects/scratch/src/paginate.js (overwrite)
@@ -12,7 +12,7 @@
   const start = page * pageSize;
-  const end = start + pageSize + 1;
+  const end = start + pageSize;
   return items.slice(start, end);
 }
------------------------------------------------------------
Proceed? [y/N] y
Fixed it -- `end` was including one extra item past the page boundary.
```

## Install

```
git clone https://github.com/butaraul/marmota marmota && cd marmota
npm install && npm run build
npm link 
```

marmota is not yet published to the npm registry (see Limitations), so
there is no `npm install -g marmota` today -- `npm link` from a local clone
is the real install path.

## Quickstart

```
marmota setup
```

The wizard shows one list of models to pick from: any [Ollama](https://ollama.com)
models you already have installed, a few local ones it can download for you
on the spot (just runs `ollama pull`), and hosted options on Groq or
OpenRouter (both free tier). Pick one; if it's hosted, it asks for an API
key and validates it with a live request before saving. Then it picks a
working directory -- the only place the agent will ever read, write, or run
commands. Then:

```
marmota
> list the files here
```

## How it works

marmota is one loop. A user message goes in; marmota builds a prompt from
the system prompt, the conversation so far, and the tool definitions; sends
it to the configured model; and either gets back final text (shown to you)
or one or more tool calls (executed, with their results fed back in, and
the loop repeats). Three safety limits bound it regardless of what the
model does: 25 tool-use iterations per message, a 30,000-character cap per
tool result, and a stop if the model issues the same tool call three times
in a row.

The tools:

| Tool | Risk | What it does |
|---|---|---|
| `list_files` | safe | lists files and directories under a path |
| `read_file` | safe | reads a file's contents |
| `write_file` | confirm | writes a file, showing a diff (or the first 20 lines if new) first |
| `run_command` | confirm | runs a command via `argv`, showing the exact array first |

## Security model

- **The sandbox is real.** Every path any tool touches is resolved and
  checked against the working directory root before use -- `..` traversal,
  absolute paths, and symlinks that resolve outside the root are all
  rejected, including for paths that don't exist yet. There is no flag to
  disable this.
- **`write_file` and `run_command` always ask first**, showing the exact
  diff or argv, and the model has no way to skip that gate -- it is
  marmota's own code that enforces it, not the model's cooperation.
- **Tool results are data, never instructions.** The system prompt states
  this explicitly, and the injection test suite measures how well it
  actually holds up against a real model: 29 of 30 fixture-runs passed
  (97%) across three real runs against Groq's `openai/gpt-oss-120b`, with
  the one failure documented in detail rather than hidden. See
  [SECURITY.md](SECURITY.md) for the threat model, what's enforced by code
  versus what depends on the model behaving well, and the full results.

## Configuration reference

`~/.marmota/config.json` (or `$XDG_CONFIG_HOME/marmota/config.json` on
Linux, if set):

```json
{
  "version": 1,
  "provider": "groq",
  "model": "openai/gpt-oss-120b",
  "baseUrl": "https://api.groq.com/openai/v1",
  "workingDir": "/home/you/projects/scratch/marmota-workspace",
  "maxIterations": 25,
  "commandTimeoutMs": 30000
}
```

The API key lives separately, in `~/.marmota/.env` (mode 600):

```
MARMOTA_API_KEY=...
```

It is never written to `config.json`, never logged, and `marmota config`
prints the config with anything key-shaped redacted. A malformed config
names the exact field that's wrong rather than silently falling back to a
default.

## Commands

```
marmota                 start an interactive session
marmota --continue       resume the most recent session
marmota --yolo           skip every confirmation (warns every run; never persisted)
marmota setup            run the setup wizard
marmota config           print the config, secrets redacted
marmota uninstall        remove all marmota data (config, sessions, everything under ~/.marmota)
```

## Limitations

Honestly:

- **No one-shot mode yet.** `marmota "do the thing"` and per-run `--dir`/
  `--model`/`--version`/`--help` flags aren't implemented -- only the
  commands listed above exist.
- **The sandbox protects the rest of your filesystem, not the contents of
  the working directory.** A model that decides to overwrite everything in
  it still can, subject to the normal `write_file` confirmation.
- **`run_command` has no network sandbox.** If you approve a command that
  makes a network request, that request goes out. The confirmation prompt
  is the only gate.
- **The bundled model catalogue (`models.json`) is what ships in this repo.**
  The remote-refresh URL in `src/providers/index.ts` is a placeholder (this
  repo has no GitHub remote yet), so it always falls back to the bundled
  copy for now -- update that URL once this repo has a real home. Free-tier
  model lists, Groq's and especially OpenRouter's, change often; treat the
  bundled catalogue as a snapshot from when it was last verified, not a
  living document.
- **Model quality varies.** In injection testing, `openai/gpt-oss-120b` on
  Groq's free tier occasionally got stuck repeating the same tool call
  (caught safely by the stuck-loop limit) and, once, attempted an
  unprompted write/run action it shouldn't have -- see SECURITY.md. A
  weaker or less carefully instructed model will be worse at treating tool
  output as data rather than instructions.
- **No response streaming.** marmota waits for the full model reply before
  printing anything.
- **Not tested on Windows.** The sandbox's symlink resolution and the
  `.env` file's mode-600 permission check are both POSIX assumptions.
- **Zero runtime dependencies, which cuts both ways.** The diff shown before
  a `write_file` confirmation is a small hand-rolled line differ, not a
  battle-tested library -- it's covered by tests but hasn't seen the edge
  cases a widely used diff implementation has.

## Uninstall

```
marmota uninstall
```

Lists everything under `~/.marmota` with real file sizes, separately notes
any Ollama models it finds (those are Ollama's to manage, not marmota's --
you'll get the exact `ollama rm` command for each), asks for confirmation,
then deletes `~/.marmota` and reports what was freed. Finish by running
`npm uninstall -g marmota` to remove the CLI itself.

## Contributing

Zero runtime dependencies is a hard constraint -- if a change seems to need
one, that's worth a conversation before the code. `npm test` (safe-path,
loop, tools, config, and session tests) should pass; the injection suite
under `test/injection/` additionally needs `MARMOTA_BASE_URL` and
`MARMOTA_MODEL` set to a real, reachable model to run at all, and skips
cleanly without them.

## Licence

MIT -- see [LICENSE](LICENSE).
