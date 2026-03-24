#!/usr/bin/env bash
# Quick DNS diagnostics for transactional email (SPF, DMARC, Resend DKIM).
# Usage: ./scripts/email-dns-check.sh deepcast.art
set -euo pipefail
DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "Usage: $0 <domain>" >&2
  echo "Example: $0 deepcast.art" >&2
  exit 1
fi

echo "=== SPF (TXT at apex) ==="
host -t TXT "$DOMAIN" 2>/dev/null || true
echo
echo "=== DMARC ==="
host -t TXT "_dmarc.$DOMAIN" 2>/dev/null || echo "(no _dmarc record — add one for Gmail trust)"
echo
echo "=== Resend DKIM (common names — confirm in Resend dashboard) ==="
for name in resend._domainkey default._domainkey; do
  echo "--- $name.$DOMAIN ---"
  host -t CNAME "$name.$DOMAIN" 2>/dev/null || host -t TXT "$name.$DOMAIN" 2>/dev/null || true
done
echo
echo "Tip: Exact DKIM CNAMEs are in Resend → Domains → your domain."
