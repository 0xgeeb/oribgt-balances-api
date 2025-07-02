#!/bin/bash

echo "🧹 Starting server cleanup..."
echo "============================="

# Stop PM2 processes
echo "📦 Stopping PM2 processes..."
if command -v pm2 &> /dev/null; then
    pm2 stop all 2>/dev/null || echo "No PM2 processes running"
    pm2 delete all 2>/dev/null || echo "No PM2 processes to delete"
    pm2 flush 2>/dev/null || echo "No PM2 logs to clean"
else
    echo "PM2 is not installed or not in PATH."
fi

# Clean up temporary and env files
echo "🗑️  Cleaning temporary files..."
rm -f *.log 2>/dev/null && echo "Log files removed" || echo "No log files found"
rm -f .env 2>/dev/null && echo ".env file removed" || echo "No .env file found"

# Database cleanup
echo ""
echo "🗄️  Cleaning up PostgreSQL database..."
echo "======================================"

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed or not in PATH."
    exit 1
fi

# Ensure PostgreSQL service is running
if systemctl is-active --quiet postgresql; then
    echo "✅ PostgreSQL is running. Proceeding with cleanup..."
else
    echo "🔄 PostgreSQL is not running. Starting it..."
    sudo systemctl start postgresql
    sleep 2
fi

# Truncate and reset tables
echo "⚙️  Truncating tables and resetting sequences..."
sudo -u postgres psql -d token_balances <<SQL
TRUNCATE TABLE transfer_events RESTART IDENTITY CASCADE;
TRUNCATE TABLE latest_blocks RESTART IDENTITY CASCADE;
ALTER SEQUENCE transfer_events_id_seq RESTART WITH 1;
ALTER SEQUENCE latest_blocks_id_seq RESTART WITH 1;
SQL

echo ""
echo "✅ Database cleanup completed!"
echo "✅ Server cleanup completed!"
echo ""
echo "To restart services:"
echo "  sudo systemctl start postgresql"
echo "  pm2 start update.ts --name updater"
echo "  pm2 start app.ts --name api"
echo ""
echo "You can now run ingest again with a clean database."
