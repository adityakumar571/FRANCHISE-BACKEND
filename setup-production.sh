#!/bin/bash
# Setup Super Admin on Production Render

echo "Creating Super Admin on Production..."
echo ""

curl -X POST https://saas-backend-f40t.onrender.com/api/setup/create-superadmin \
  -H "Content-Type: application/json" \
  -d '{"secret":"change-me-in-production-2024"}' \
  -w "\n\nHTTP Status: %{http_code}\n"

echo ""
echo "If successful, use these credentials:"
echo "User ID: superadmin"
echo "Password: SuperAdmin@123"
