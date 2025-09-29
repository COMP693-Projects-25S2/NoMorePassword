# NSN Configuration Guide

## Environment Configuration

NSN supports different environments through configuration files and environment variables.

### Local Development

The default configuration is for local development:

**config.env** (current):
```env
# NSN Environment Configuration
NSN_ENVIRONMENT=local
B_CLIENT_API_URL=http://localhost:3000
```

### Production Deployment

For production deployment, update the configuration:

**config.env** (production):
```env
# NSN Environment Configuration
NSN_ENVIRONMENT=production
B_CLIENT_API_URL=https://your-production-b-client-url.com
```

### Configuration Loading

1. **Environment Variables**: NSN loads configuration from `config.env` file
2. **Fallback**: If `config.env` doesn't exist, uses default values
3. **Validation**: Production environment requires `B_CLIENT_API_URL` to be set

### Configuration Files

- `config.env` - Current environment configuration
- `config.env.production.example` - Production configuration template
- `webapp/config.py` - Configuration logic and validation

### Environment Variables

| Variable | Description | Default | Required in Production |
|----------|-------------|---------|----------------------|
| `NSN_ENVIRONMENT` | Environment type (local/production) | `local` | No |
| `B_CLIENT_API_URL` | B-Client API endpoint URL | `http://localhost:3000` | Yes |

### Switching Environments

**To switch to production:**
1. Update `config.env`:
   ```env
   NSN_ENVIRONMENT=production
   B_CLIENT_API_URL=https://your-production-url.com
   ```
2. Restart NSN server

**To switch back to local:**
1. Update `config.env`:
   ```env
   NSN_ENVIRONMENT=local
   B_CLIENT_API_URL=http://localhost:3000
   ```
2. Restart NSN server

### Validation

- **Local Environment**: Uses default localhost URL if not specified
- **Production Environment**: Requires `B_CLIENT_API_URL` to be explicitly set
- **Error Handling**: Production deployment will fail if required configuration is missing
