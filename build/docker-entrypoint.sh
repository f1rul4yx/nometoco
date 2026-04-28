#!/bin/sh
set -e

# Run setup if database doesn't exist yet
if [ ! -f /app/data/nometoco.db ]; then
  echo "🔧 Primera ejecución: creando base de datos..."
  node src/setup.js
fi

exec "$@"
