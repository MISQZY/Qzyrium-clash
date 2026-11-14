#!/bin/sh
set -e

# Grant network capabilities to Mihomo core binary for TUN mode
for dir in "/opt/Qzyrium-clash" "/opt/qzyrium-clash"; do
  if [ -d "$dir" ]; then
    MIHOMO="$dir/resources/sidecar/mihomo"
    if [ -f "$MIHOMO" ]; then
      chmod 755 "$MIHOMO" || true
      setcap cap_net_admin,cap_net_bind_service+ep "$MIHOMO" || true
    fi

    SANDBOX="$dir/chrome-sandbox"
    if [ -f "$SANDBOX" ]; then
      chmod 4755 "$SANDBOX" || true
    fi
  fi
done
