#!/bin/sh
set -e
node dist/migrate.js
node dist/seed.js --if-empty
exec node dist/main.js
