#!/usr/bin/env bash
# Run after `npx cap add android`: adds the reminder icon and the exact-alarm permission.
set -euo pipefail
RES=android/app/src/main/res
MANIFEST=android/app/src/main/AndroidManifest.xml

mkdir -p "$RES/drawable"
cp android-overlay/ic_stat_moon.xml "$RES/drawable/ic_stat_moon.xml"

if ! grep -q "USE_EXACT_ALARM" "$MANIFEST"; then
  sed -i 's#<application#<uses-permission android:name="android.permission.USE_EXACT_ALARM" />\n    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />\n    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n    <application#' "$MANIFEST"
fi
grep -n "uses-permission" "$MANIFEST"
