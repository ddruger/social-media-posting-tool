#!/usr/bin/env bash
#
# Social Studio — one-command setup.
#
#   bash setup.sh
#
# Creates the Cloudflare database and storage, fills in the two config values
# you would otherwise copy and paste by hand, asks for your keys, and deploys.
# Safe to run again: it skips anything already done.

set -euo pipefail
cd "$(dirname "$0")"

B=$'\033[1m'; DIM=$'\033[2m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; N=$'\033[0m'
say()  { printf '%s\n' "$*"; }
step() { printf '\n%s▸ %s%s\n' "$B" "$*" "$N"; }
ok()   { printf '  %s✓%s %s\n' "$G" "$N" "$*"; }
warn() { printf '  %s!%s %s\n' "$Y" "$N" "$*"; }
die()  { printf '\n%sX %s%s\n' "$R" "$*" "$N" >&2; exit 1; }

WR="npx --yes wrangler"
DB_NAME="social-studio"
BUCKET="social-studio-media"

# Rewrites one key in wrangler.toml. Uses node, which is already required.
patch_toml() {
  node -e '
    const fs = require("fs");
    const [file, key, val] = process.argv.slice(1);
    let s = fs.readFileSync(file, "utf8");
    const re = new RegExp("^(\\s*" + key + "\\s*=\\s*).*$", "m");
    if (!re.test(s)) { console.error("Could not find " + key + " in " + file); process.exit(1); }
    fs.writeFileSync(file, s.replace(re, "$1\"" + val + "\""));
  ' wrangler.toml "$1" "$2"
}

read_toml() {
  node -e '
    const fs = require("fs");
    const m = fs.readFileSync("wrangler.toml", "utf8")
      .match(new RegExp("^\\s*" + process.argv[1] + "\\s*=\\s*\"([^\"]*)\"", "m"));
    process.stdout.write(m ? m[1] : "");
  ' "$1"
}

say "${B}Social Studio setup${N}"
say "${DIM}Creates your Cloudflare resources, stores your keys, and deploys.${N}"

# ── 0. Prerequisites ────────────────────────────────────────────────────────
step "Checking prerequisites"
command -v node >/dev/null 2>&1 || die "Node.js is not installed. Get it from https://nodejs.org then run this again."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 18 ] || die "Node.js 18 or newer is required (you have $(node -v)). Update at https://nodejs.org"
ok "Node $(node -v)"
[ -d node_modules ] || { say "  Installing dependencies…"; npm install --no-audit --no-fund >/dev/null 2>&1; }
ok "Dependencies installed"

# ── 1. Cloudflare login ─────────────────────────────────────────────────────
step "Cloudflare account"
# `wrangler whoami` exits 0 even when logged out, so read what it says.
WHO="$($WR whoami 2>&1 || true)"
if printf '%s' "$WHO" | grep -qi 'not authenticated'; then
  if [ ! -t 0 ]; then
    die "Not logged in to Cloudflare, and this isn't an interactive terminal.
   Run 'npx wrangler login' in a normal Terminal window first, then re-run this script."
  fi
  say "  A browser window will open. Log in to Cloudflare and click Allow."
  $WR login </dev/tty || die "Cloudflare login failed. Run 'npx wrangler login' yourself, then re-run this script."
  WHO="$($WR whoami 2>&1 || true)"
  printf '%s' "$WHO" | grep -qi 'not authenticated' \
    && die "Still not logged in. Run 'npx wrangler login' and complete it in the browser, then re-run this script."
  ok "Logged in"
else
  EMAIL="$(printf '%s' "$WHO" | grep -oE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' | head -1 || true)"
  ok "Already logged in${EMAIL:+ as $EMAIL}"
fi

# ── 2. Database ─────────────────────────────────────────────────────────────
step "Database"
DB_ID="$(read_toml database_id)"
if [[ "$DB_ID" =~ ^[0-9a-f-]{36}$ ]]; then
  ok "Already configured ($DB_ID)"
else
  OUT="$($WR d1 create "$DB_NAME" 2>&1 || true)"
  DB_ID="$(printf '%s' "$OUT" | grep -oiE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || true)"
  if [ -z "$DB_ID" ]; then
    # Most likely it already exists from an earlier run — look it up instead.
    DB_ID="$($WR d1 list --json 2>/dev/null | node -e '
      let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
        try { const r=JSON.parse(s).find(d=>d.name===process.argv[1]); process.stdout.write(r?(r.uuid||r.database_id||""):""); }
        catch { process.stdout.write(""); }
      });' "$DB_NAME" || true)"
  fi
  [ -n "$DB_ID" ] || { say "$OUT"; die "Could not create or find the database. The output above should say why."; }
  patch_toml database_id "$DB_ID"
  ok "Created and wired into wrangler.toml ($DB_ID)"
fi

say "  Creating tables…"
# NB: `d1 migrations apply` has no -y flag. Passing one is silently ignored and
# the command exits 0 having done nothing, so don't add one. It prompts when a
# terminal is attached, which is why its output is not suppressed here.
$WR d1 migrations apply DB --remote \
  || die "Could not create the tables. Try: npx wrangler d1 migrations apply DB --remote"

TABLES="$($WR d1 execute DB --remote --command "SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='posts';" --json 2>/dev/null || true)"
if printf '%s' "$TABLES" | grep -q '"n": *0'; then
  die "The migration reported success but created no tables.
   Run this and read what it says: npx wrangler d1 migrations apply DB --remote"
fi
ok "Tables ready"

# ── 3. Media storage ────────────────────────────────────────────────────────
step "Media storage"
if $WR r2 bucket create "$BUCKET" >/dev/null 2>&1; then
  ok "Bucket created ($BUCKET)"
else
  ok "Bucket already exists ($BUCKET)"
fi

# ── 4. Secrets ──────────────────────────────────────────────────────────────
step "Your keys"
EXISTING="$($WR secret list --json 2>/dev/null || echo '[]')"
has_secret() { printf '%s' "$EXISTING" | grep -q "\"$1\""; }

put_secret() { # name, prompt, silent(y/n), optional(y/n)
  local name="$1" prompt="$2" silent="$3" optional="$4" val=""
  if has_secret "$name"; then
    printf '  %s is already set. Replace it? [y/N] ' "$name"
    read -r ans </dev/tty || ans=""
    [[ "$ans" =~ ^[Yy]$ ]] || { ok "$name kept as-is"; return; }
  fi
  while :; do
    if [ "$silent" = y ]; then
      printf '  %s: ' "$prompt"; read -rs val </dev/tty; echo
    else
      printf '  %s: ' "$prompt"; read -r val </dev/tty
    fi
    [ -n "$val" ] && break
    [ "$optional" = y ] && { warn "$name skipped"; return; }
    warn "That can't be empty."
  done
  printf '%s' "$val" | $WR secret put "$name" >/dev/null 2>&1 \
    || die "Could not save $name. Try: npx wrangler secret put $name"
  ok "$name saved"
}

say "${DIM}  Typed values are sent straight to Cloudflare, encrypted. They are never${N}"
say "${DIM}  written to a file in this folder and never committed to git.${N}"
put_secret APP_PASSWORD      "Choose a password for signing in to Social Studio" y n
put_secret UPLOADPOST_API_KEY "Your Upload-Post API key (dashboard → API Keys)"  y n
say "${DIM}  The next one must EXACTLY match the profile name in Upload-Post's${N}"
say "${DIM}  dashboard under User Management. Lowercase, no spaces.${N}"
put_secret UPLOADPOST_USER   "Your Upload-Post profile name"                    n n
say "${DIM}  Optional — only needed for the 'Rewrite with AI' button. Press Enter to skip.${N}"
put_secret ANTHROPIC_API_KEY "Anthropic API key (optional)"                     y y

# ── 5. Deploy ───────────────────────────────────────────────────────────────
step "Deploying"
OUT="$($WR deploy 2>&1)" || { say "$OUT"; die "Deploy failed. The output above should say why."; }
URL="$(printf '%s' "$OUT" | grep -oE 'https://[a-zA-Z0-9._-]+\.workers\.dev' | head -1 || true)"
[ -n "$URL" ] || { say "$OUT"; die "Deployed, but could not read the URL from the output above."; }
ok "Deployed to $URL"

# ── 6. Second deploy, so Upload-Post can fetch your videos ──────────────────
CURRENT="$(read_toml PUBLIC_BASE_URL)"
if [ "$CURRENT" = "$URL" ]; then
  ok "Video URL already configured"
else
  step "Wiring up video hosting"
  say "${DIM}  Upload-Post fetches your videos from this URL, so it has to be set${N}"
  say "${DIM}  and deployed a second time. Doing that now.${N}"
  patch_toml PUBLIC_BASE_URL "$URL"
  $WR deploy >/dev/null 2>&1 || die "Second deploy failed. Run 'npx wrangler deploy' yourself."
  ok "Done"
fi

# ── Finished ────────────────────────────────────────────────────────────────
cat <<EOF

${G}${B}Setup complete.${N}

  Open:     ${B}${URL}${N}
  Sign in:  the password you chose above

${B}Still to do, in the Upload-Post dashboard:${N}
  1. User Management → create a profile named exactly what you entered
     for UPLOADPOST_USER above.
  2. Connect LinkedIn, X, Threads, Instagram, TikTok and YouTube — press Connect on
     each, approve the permissions.
     Instagram must be a Business or Creator account, verified, with every
     permission approved. The other four need no preparation.

${DIM}Re-run this script any time — it skips whatever is already done.
To change a key later:  npx wrangler secret put NAME
To see live logs:       npm run logs${N}
EOF
