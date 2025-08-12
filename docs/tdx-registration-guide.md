# TDX Registration Guide

This guide documents the process to obtain TDX API credentials for the Smart TRA MCP Server.

## Registration Process

### Step 1: Create Account

1. Visit [TDX Portal](https://tdx.transportdata.tw/)
2. Click "會員註冊" (Member Registration) in the top right
3. Fill in the registration form:
   - Username (英文帳號)
   - Email
   - Password (8+ characters with numbers and letters)
   - Personal information
   - Agree to terms of service

### Step 2: Email Verification

1. Check your email for verification link
2. Click the link to activate your account
3. You'll see a confirmation message

### Step 3: Admin Approval

- **Important**: Account requires admin approval (usually 1-2 business days)
- You'll receive an email when approved
- Status shows as "待審核" (Pending Review) until approved

### Step 4: Generate API Keys

Once approved:

1. Login to [TDX Portal](https://tdx.transportdata.tw/)
2. Go to "會員中心" (Member Center)
3. Click "API金鑰" (API Keys) section
4. Click "新增金鑰" (Add New Key)
5. Enter a description for your key (e.g., "Smart TRA MCP Server")
6. Click "確定" (Confirm)
7. **Important**: Save both Client ID and Client Secret immediately
   - You can only see the secret once!
   - Maximum 3 key pairs per account

### Step 5: Configure Credentials

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your credentials:
   ```
   TDX_CLIENT_ID=your_actual_client_id
   TDX_CLIENT_SECRET=your_actual_client_secret
   ```

3. Test authentication:
   ```bash
   npm run test:auth
   ```

## API Limits

- **Rate Limit**: 50 requests/second per API key
- **Parallel Connections**: 60 concurrent connections per IP
- **Token Expiry**: 24 hours (86400 seconds)
- **Data Update Frequency**: 
  - Real-time data: 1-2 minutes
  - Timetable data: Daily updates

## Troubleshooting

### Common Issues

1. **"Authentication failed: 401"**
   - Check credentials are correct
   - Ensure account is approved
   - Verify no extra spaces in .env file

2. **"Authentication failed: 400"**
   - Invalid client credentials format
   - Check for special characters that need escaping

3. **Network timeout**
   - TDX servers may be under maintenance
   - Check https://tdx.transportdata.tw/ for service status

4. **Rate limit exceeded (429)**
   - Implement proper throttling
   - Consider caching responses
   - Use batch queries where possible

## Additional Resources

- [TDX API Documentation](https://tdx.transportdata.tw/api-service/swagger)
- [OData Query Guide](https://www.odata.org/documentation/)
- [TDX Service Status](https://tdx.transportdata.tw/)

## Security Notes

- Never commit `.env` file to version control
- Use environment variables in production
- Rotate API keys periodically
- Monitor usage in TDX member center