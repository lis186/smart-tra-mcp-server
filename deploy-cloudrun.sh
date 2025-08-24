#!/bin/bash

# Deploy Smart TRA MCP Server to Google Cloud Run
# Usage: ./deploy-cloudrun.sh [PROJECT_ID] [REGION]

set -e

PROJECT_ID=${1:-"n8n-automation-424916"}
REGION=${2:-"asia-east1"}
SERVICE_NAME="smart-tra-mcp-server"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "🚀 Deploying Smart TRA MCP Server to Cloud Run"
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "Service: ${SERVICE_NAME}"

# Build and push container
echo "📦 Building container..."
gcloud builds submit --tag ${IMAGE_NAME} --project ${PROJECT_ID}

echo "🚀 Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME} \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --timeout 300 \
  --concurrency 80 \
  --set-env-vars NODE_ENV=production \
  --set-env-vars TDX_CLIENT_ID=lis186-103d3ee2-0f5a-45cd \
  --set-env-vars TDX_CLIENT_SECRET=c7dc9240-e923-457e-a39c-d01d53d2b8ed \
  --project ${PROJECT_ID}

echo "✅ Deployment complete!"

# Get the service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --platform managed --region ${REGION} --format 'value(status.url)' --project ${PROJECT_ID})
echo "🌐 Service URL: ${SERVICE_URL}"
echo "🏥 Health check: ${SERVICE_URL}/health"
echo "🔧 MCP endpoint: ${SERVICE_URL}/mcp"

# Test health endpoint
echo "🧪 Testing health endpoint..."
curl -f "${SERVICE_URL}/health" | jq '.' || echo "Health check failed"