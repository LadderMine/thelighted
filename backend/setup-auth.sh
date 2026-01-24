#!/bin/bash

# Authentication System Setup Script
# This script sets up the complete authentication system for TheLighted

echo "🚀 Setting up Authentication & User Management System..."
echo ""

# Navigate to backend directory
cd "$(dirname "$0")"

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "⚠️  Please update the .env file with your actual credentials!"
    echo ""
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

# Check if PostgreSQL is running
echo "🐘 Checking PostgreSQL connection..."
if command -v psql &> /dev/null; then
    echo "✅ PostgreSQL client found"
else
    echo "⚠️  PostgreSQL client not found. Please install PostgreSQL."
fi
echo ""

# Check if Redis is running
echo "🔴 Checking Redis connection..."
if command -v redis-cli &> /dev/null; then
    if redis-cli ping &> /dev/null; then
        echo "✅ Redis is running"
    else
        echo "⚠️  Redis is not running. Starting Redis..."
        redis-server --daemonize yes
    fi
else
    echo "⚠️  Redis not found. Please install Redis."
fi
echo ""

# Run tests
echo "🧪 Running tests..."
npm run test
echo ""

# Start the application
echo "🎉 Setup complete!"
echo ""
echo "To start the application, run:"
echo "  npm run start:dev"
echo ""
echo "The API will be available at: http://localhost:3000/api"
echo ""
echo "📚 Check AUTH_README.md for API documentation and usage examples"
